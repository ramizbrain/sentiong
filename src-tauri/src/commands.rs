//! Thin IPC layer: moves blocking work off the async runtime, delegates to the
//! `Sentiong` service, and tells the rest of the app when the profiles changed.

use std::path::PathBuf;
use std::sync::Arc;

use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Runtime, State};

use crate::error::{AppError, AppResult};
use crate::login::LoginKind;
use crate::models::{
    Environment, GhAccount, GithubUser, KeyUsage, LoginEvent, ProfileInput, RepoFix, RepoReport,
    RepoScanEvent, Snapshot, SshKey, UploadOutcome,
};
use crate::service::Sentiong;
use crate::tray;

type Service<'a> = State<'a, Arc<Sentiong>>;

/// Event carrying a fresh `Snapshot` whenever profiles change, whoever changed them.
pub const SNAPSHOT_CHANGED: &str = "snapshot-changed";

async fn blocking<T: Send + 'static>(
    service: &Service<'_>,
    work: impl FnOnce(&Sentiong) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let service = Arc::clone(service.inner());
    spawn_blocking(move || work(&service))
        .await
        .map_err(|error| AppError::Task(error.to_string()))?
}

/// Updates the tray and every window after a change.
pub fn notify<R: Runtime>(app: &AppHandle<R>, snapshot: &Snapshot) {
    tray::update(app, snapshot);
    let _ = app.emit(SNAPSHOT_CHANGED, snapshot);
}

async fn changing<R: Runtime>(
    app: AppHandle<R>,
    service: &Service<'_>,
    work: impl FnOnce(&Sentiong) -> AppResult<Snapshot> + Send + 'static,
) -> AppResult<Snapshot> {
    let snapshot = blocking(service, work).await?;
    notify(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub async fn get_environment(service: Service<'_>) -> AppResult<Environment> {
    blocking(&service, |service| Ok(service.environment())).await
}

#[tauri::command]
pub async fn get_snapshot(service: Service<'_>) -> AppResult<Snapshot> {
    blocking(&service, Sentiong::snapshot).await
}

#[tauri::command]
pub async fn save_profile<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    id: Option<String>,
    input: ProfileInput,
) -> AppResult<Snapshot> {
    changing(app, &service, move |service| {
        service.save_profile(id.as_deref(), input)
    })
    .await
}

#[tauri::command]
pub async fn delete_profile<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    id: String,
) -> AppResult<Snapshot> {
    changing(app, &service, move |service| service.delete_profile(&id)).await
}

#[tauri::command]
pub async fn activate_profile<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    id: String,
) -> AppResult<Snapshot> {
    changing(app, &service, move |service| service.activate_profile(&id)).await
}

#[tauri::command]
pub async fn set_guard_enabled<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    enabled: bool,
) -> AppResult<Snapshot> {
    changing(app, &service, move |service| service.set_guard(enabled)).await
}

#[tauri::command]
pub async fn set_connected<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    connected: bool,
) -> AppResult<Snapshot> {
    changing(app, &service, move |service| {
        service.set_connected(connected)
    })
    .await
}

#[tauri::command]
pub async fn list_gh_accounts(service: Service<'_>) -> AppResult<Vec<GhAccount>> {
    blocking(&service, Sentiong::gh_accounts).await
}

#[tauri::command]
pub async fn get_github_user(service: Service<'_>, login: String) -> AppResult<GithubUser> {
    blocking(&service, move |service| service.github_user(&login)).await
}

#[tauri::command]
pub async fn start_github_login(
    service: Service<'_>,
    on_event: Channel<LoginEvent>,
) -> AppResult<()> {
    run_login(&service, LoginKind::NewAccount, on_event).await
}

#[tauri::command]
pub async fn grant_key_permissions(
    service: Service<'_>,
    login: String,
    on_event: Channel<LoginEvent>,
) -> AppResult<()> {
    run_login(&service, LoginKind::GrantKeyScopes { login }, on_event).await
}

async fn run_login(
    service: &Service<'_>,
    kind: LoginKind,
    on_event: Channel<LoginEvent>,
) -> AppResult<()> {
    blocking(service, move |service| {
        // A failed send only means the window went away.
        service.login(kind, move |event| {
            let _ = on_event.send(event);
        })
    })
    .await
}

#[tauri::command]
pub fn cancel_github_login(service: Service<'_>) {
    service.cancel_login();
}

#[tauri::command]
pub async fn list_ssh_keys(service: Service<'_>) -> AppResult<Vec<SshKey>> {
    blocking(&service, Sentiong::ssh_keys).await
}

#[tauri::command]
pub async fn generate_ssh_key(
    service: Service<'_>,
    name_hint: String,
    comment: String,
) -> AppResult<SshKey> {
    blocking(&service, move |service| {
        service.generate_ssh_key(&name_hint, &comment)
    })
    .await
}

#[tauri::command]
pub async fn upload_ssh_key(
    service: Service<'_>,
    login: String,
    private_key_path: String,
    usage: KeyUsage,
    title: String,
) -> AppResult<UploadOutcome> {
    blocking(&service, move |service| {
        service.upload_ssh_key(&login, &private_key_path, usage, &title)
    })
    .await
}

#[tauri::command]
pub async fn scan_repositories(
    service: Service<'_>,
    root: String,
    on_event: Channel<RepoScanEvent>,
) -> AppResult<()> {
    blocking(&service, move |service| {
        let total = service.scan_repositories(&PathBuf::from(root), |report| {
            let _ = on_event.send(RepoScanEvent::Found { report });
        })?;
        let _ = on_event.send(RepoScanEvent::Finished { total });
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn fix_repository<R: Runtime>(
    app: AppHandle<R>,
    service: Service<'_>,
    path: String,
    fix: RepoFix,
) -> AppResult<RepoReport> {
    let (report, snapshot) = blocking(&service, move |service| {
        service.fix_repository(&PathBuf::from(path), fix)
    })
    .await?;
    notify(&app, &snapshot);
    Ok(report)
}
