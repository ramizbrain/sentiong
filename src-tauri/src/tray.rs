//! The menu bar / system tray menu: shows the default profile and switches it in one click.

use std::sync::Arc;

use tauri::menu::{CheckMenuItem, Menu, MenuBuilder, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::commands::notify;
use crate::models::Snapshot;
use crate::service::Sentiong;

const TRAY_ID: &str = "sentiong";
const PROFILE_PREFIX: &str = "profile:";
const OPEN_ID: &str = "open";
const QUIT_ID: &str = "quit";

/// Event sent to the window when a tray action fails, so the UI can show why.
pub const TRAY_ERROR: &str = "tray-error";

pub fn create<R: Runtime>(app: &AppHandle<R>, snapshot: Option<&Snapshot>) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&build_menu(app, snapshot)?)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event);
    // macOS tints a template icon to suit light and dark menu bars; elsewhere the tray
    // shows the full-colour app icon.
    if cfg!(target_os = "macos") {
        builder = builder
            .icon(tauri::include_image!("icons/tray-template.png"))
            .icon_as_template(true);
    } else if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;
    if let Some(snapshot) = snapshot {
        apply_labels(&tray, snapshot);
    }
    Ok(())
}

/// Rebuilds the menu after any change. Does nothing when there is no tray (tests).
pub fn update<R: Runtime>(app: &AppHandle<R>, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app, Some(snapshot)) {
        let _ = tray.set_menu(Some(menu));
    }
    apply_labels(&tray, snapshot);
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    snapshot: Option<&Snapshot>,
) -> tauri::Result<Menu<R>> {
    let mut menu = MenuBuilder::new(app);
    let profiles = snapshot
        .map(|snapshot| snapshot.profiles.as_slice())
        .unwrap_or_default();

    if profiles.is_empty() {
        menu = menu.item(&MenuItem::with_id(
            app,
            "empty",
            "No profiles yet",
            false,
            None::<&str>,
        )?);
    } else {
        menu = menu.item(&MenuItem::with_id(
            app,
            "heading",
            "Default profile",
            false,
            None::<&str>,
        )?);
        for profile in profiles {
            let active =
                snapshot.and_then(|s| s.active_profile_id.as_deref()) == Some(profile.id.as_str());
            let label = match &profile.details.github_login {
                Some(login) => format!("{}  ·  @{login}", profile.details.label),
                None => profile.details.label.clone(),
            };
            let id = format!("{PROFILE_PREFIX}{}", profile.id);
            menu = menu.item(&CheckMenuItem::with_id(
                app,
                id,
                label,
                true,
                active,
                None::<&str>,
            )?);
        }
    }

    menu.item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItem::with_id(
            app,
            OPEN_ID,
            "Open Sentiong",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            QUIT_ID,
            "Quit Sentiong",
            true,
            None::<&str>,
        )?)
        .build()
}

/// macOS shows the default profile's name next to the icon; every platform gets a tooltip.
fn apply_labels<R: Runtime>(tray: &tauri::tray::TrayIcon<R>, snapshot: &Snapshot) {
    let active = snapshot
        .active_profile_id
        .as_deref()
        .and_then(|id| snapshot.profiles.iter().find(|profile| profile.id == id));
    let label = active.map(|profile| profile.details.label.clone());
    #[cfg(target_os = "macos")]
    let _ = tray.set_title(label.as_deref());
    let tooltip = match &label {
        Some(label) => format!("Sentiong: committing as {label}"),
        None => "Sentiong".to_string(),
    };
    let _ = tray.set_tooltip(Some(tooltip));
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        OPEN_ID => show_main_window(app),
        QUIT_ID => app.exit(0),
        id => {
            if let Some(profile_id) = id.strip_prefix(PROFILE_PREFIX) {
                activate_from_tray(app, profile_id.to_string());
            }
        }
    }
}

fn activate_from_tray<R: Runtime>(app: &AppHandle<R>, profile_id: String) {
    let app = app.clone();
    let service = Arc::clone(app.state::<Arc<Sentiong>>().inner());
    // gh and git calls block; keep them off the main thread.
    std::thread::spawn(move || match service.activate_profile(&profile_id) {
        Ok(snapshot) => notify(&app, &snapshot),
        Err(error) => {
            // Undo the check mark the click just toggled.
            if let Ok(snapshot) = service.snapshot() {
                update(&app, &snapshot);
            }
            let _ = app.emit(TRAY_ERROR, error.to_string());
            show_main_window(&app);
        }
    });
}
