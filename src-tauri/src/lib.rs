mod commands;
mod config_writer;
mod error;
mod gh;
mod gitconfig;
mod guard;
mod login;
mod models;
mod paths;
mod profiles;
mod programs;
mod repos;
mod service;
mod ssh;
mod store;
mod tray;

use std::sync::Arc;

use paths::SentiongPaths;
use service::Sentiong;
use tauri::{Builder, Manager, RunEvent, Runtime, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = with_sentiong_backend(Builder::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let service = Arc::new(Sentiong::new(SentiongPaths::new(app.path().home_dir()?)));
            if let Err(error) = service.refresh_config() {
                eprintln!("Sentiong could not refresh the Git config: {error}");
            }
            let snapshot = service.snapshot().ok();
            app.manage(service);
            tray::create(app.handle(), snapshot.as_ref())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps Sentiong running in the menu bar / tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Sentiong");

    app.run(|app, event| {
        // Clicking the Dock icon brings the hidden window back.
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            tray::show_main_window(app);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

/// The commands that make up Sentiong's backend. Shared by the real app and the IPC
/// tests, so the tests exercise exactly what the frontend talks to.
fn with_sentiong_backend<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::get_environment,
        commands::get_snapshot,
        commands::save_profile,
        commands::delete_profile,
        commands::activate_profile,
        commands::set_guard_enabled,
        commands::set_connected,
        commands::list_gh_accounts,
        commands::get_github_user,
        commands::start_github_login,
        commands::grant_key_permissions,
        commands::cancel_github_login,
        commands::list_ssh_keys,
        commands::generate_ssh_key,
        commands::upload_ssh_key,
        commands::scan_repositories,
        commands::fix_repository,
    ])
}

#[cfg(test)]
mod ipc_tests {
    use std::sync::Arc;

    use serde_json::{Value, json};
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{
        INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
    };
    use tauri::webview::InvokeRequest;
    use tauri::{WebviewWindow, WebviewWindowBuilder};

    use super::*;

    struct Harness {
        _home: tempfile::TempDir,
        window: WebviewWindow<MockRuntime>,
    }

    fn harness() -> Harness {
        let home = tempfile::tempdir().unwrap();
        let service = Arc::new(Sentiong::new(SentiongPaths::new(
            home.path().canonicalize().unwrap(),
        )));
        let app = with_sentiong_backend(mock_builder())
            .manage(service)
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Harness {
            _home: home,
            window,
        }
    }

    /// Sends a command the same way `invoke(cmd, args)` does from the frontend.
    fn invoke(harness: &Harness, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            &harness.window,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    fn profile_input(label: &str, email: &str) -> Value {
        json!({
            "label": label,
            "color": "cyan",
            "githubLogin": null,
            "gitName": "Octo Cat",
            "gitEmail": email,
            "sshKeyPath": null,
            "signing": false,
            "folders": [],
            "owners": []
        })
    }

    #[test]
    fn a_new_install_has_no_profiles() {
        let harness = harness();

        let snapshot = invoke(&harness, "get_snapshot", json!({})).unwrap();

        assert_eq!(snapshot["profiles"], json!([]));
        assert_eq!(snapshot["activeProfileId"], Value::Null);
        assert_eq!(snapshot["guard"]["enabled"], json!(false));
    }

    #[test]
    fn saving_and_activating_profiles_over_ipc() {
        let harness = harness();

        let saved = invoke(
            &harness,
            "save_profile",
            json!({ "id": null, "input": profile_input("Personal", "me@home.example") }),
        )
        .unwrap();
        invoke(
            &harness,
            "save_profile",
            json!({ "id": null, "input": profile_input("Work", "me@work.example") }),
        )
        .unwrap();
        let activated = invoke(&harness, "activate_profile", json!({ "id": "work" })).unwrap();

        assert_eq!(saved["profiles"][0]["id"], json!("personal"));
        assert_eq!(saved["connected"], json!(true));
        assert_eq!(activated["activeProfileId"], json!("work"));
    }

    #[test]
    fn errors_reach_the_frontend_as_code_and_message() {
        let harness = harness();

        let error = invoke(
            &harness,
            "save_profile",
            json!({ "id": null, "input": profile_input("Broken", "nope") }),
        )
        .unwrap_err();

        assert_eq!(error["code"], json!("invalidProfile"));
        assert_eq!(error["message"], json!("\"nope\" is not an email address."));
    }

    #[test]
    fn scanning_a_missing_folder_is_reported() {
        let harness = harness();

        let error = invoke(
            &harness,
            "scan_repositories",
            json!({ "root": "/definitely/not/here", "onEvent": "__CHANNEL__:1" }),
        )
        .unwrap_err();

        assert_eq!(error["code"], json!("folderNotFound"));
    }
}
