//! The application's use cases. Commands and the tray menu both go through here, so
//! every change follows the same path: load state, change it, save it, apply it to Git.

use std::path::Path;
use std::sync::{Mutex, MutexGuard, RwLock};

use crate::config_writer::{self, WriteOptions};
use crate::error::{AppError, AppResult};
use crate::gh;
use crate::guard;
use crate::login::{self, LoginKind, LoginRegistry};
use crate::models::{
    AppState, Environment, GhAccount, GithubUser, GuardStatus, KeyUsage, LoginEvent, ProfileInput,
    RepoFix, RepoReport, Snapshot, SshKey, UploadOutcome,
};
use crate::paths::SentiongPaths;
use crate::profiles;
use crate::programs::{self, Tools};
use crate::repos;
use crate::ssh;
use crate::store;

/// Owner rules use `includeIf "hasconfig:..."`, added in Git 2.36.
const OWNER_RULES_GIT: (u32, u32) = (2, 36);

pub struct Sentiong {
    paths: SentiongPaths,
    tools: RwLock<Tools>,
    /// Held for every load-change-save-apply cycle, so two changes never interleave.
    writing: Mutex<()>,
    logins: LoginRegistry,
}

impl Sentiong {
    pub fn new(paths: SentiongPaths) -> Self {
        let tools = Tools::discover(paths.home());
        Self {
            paths,
            tools: RwLock::new(tools),
            writing: Mutex::new(()),
            logins: LoginRegistry::default(),
        }
    }

    /// Re-applies the saved profiles at startup, so changes like a moved `gh` binary
    /// are picked up. Does nothing before the first profile exists.
    pub fn refresh_config(&self) -> AppResult<()> {
        let _lock = self.lock();
        let state = self.load()?;
        if state.profiles.is_empty() {
            return Ok(());
        }
        config_writer::apply(&self.paths, &state, &self.write_options())
    }

    /// Looks for the tools again (the user may have just installed one).
    pub fn environment(&self) -> Environment {
        let tools = Tools::discover(self.paths.home());
        let status = |program: &Option<programs::Program>| {
            program
                .as_ref()
                .map_or_else(programs::missing_tool, programs::Program::status)
        };
        let git = status(&tools.git);
        let environment = Environment {
            supports_owner_rules: supports_owner_rules(git.version.as_deref()),
            git,
            gh: status(&tools.gh),
            ssh_keygen: status(&tools.ssh_keygen),
            home_directory: self.paths.home().display().to_string(),
        };
        *self.tools.write().unwrap_or_else(|p| p.into_inner()) = tools;
        environment
    }

    pub fn snapshot(&self) -> AppResult<Snapshot> {
        let state = self.load()?;
        Ok(self.snapshot_of(state))
    }

    pub fn save_profile(&self, id: Option<&str>, input: ProfileInput) -> AppResult<Snapshot> {
        self.change(|state| profiles::upsert(state, id, input).map(drop))
    }

    pub fn delete_profile(&self, id: &str) -> AppResult<Snapshot> {
        self.change(|state| profiles::remove(state, id).map(drop))
    }

    /// Makes a profile the default and, when it has a GitHub account, the active
    /// account in `gh` too. If gh refuses, nothing changes.
    pub fn activate_profile(&self, id: &str) -> AppResult<Snapshot> {
        let login = profiles::find(&self.load()?, id)?
            .details
            .github_login
            .clone();
        if let (Some(login), Some(gh)) = (login, self.tools().gh.clone()) {
            gh::switch(&gh, &login)?;
        }
        self.change(|state| profiles::activate(state, id))
    }

    pub fn set_guard(&self, enabled: bool) -> AppResult<Snapshot> {
        if enabled && let Some(conflict) = self.guard_conflict() {
            return Err(AppError::GuardConflict(format!(
                "core.hooksPath is already set to {conflict} in your Git config, so the guard can't be turned on without replacing it."
            )));
        }
        self.change(|state| {
            state.guard_enabled = enabled;
            Ok(())
        })
    }

    /// Removes Sentiong from `~/.gitconfig` (or puts it back).
    pub fn set_connected(&self, connected: bool) -> AppResult<Snapshot> {
        self.change(|state| {
            state.connected = connected;
            Ok(())
        })
    }

    pub fn gh_accounts(&self) -> AppResult<Vec<GhAccount>> {
        gh::accounts(self.tools().gh()?)
    }

    pub fn github_user(&self, login: &str) -> AppResult<GithubUser> {
        gh::user(self.tools().gh()?, login)
    }

    pub fn ssh_keys(&self) -> AppResult<Vec<SshKey>> {
        ssh::list_keys(&self.paths.ssh_dir())
    }

    pub fn generate_ssh_key(&self, name_hint: &str, comment: &str) -> AppResult<SshKey> {
        let tools = self.tools();
        ssh::generate_key(
            tools.ssh_keygen()?,
            &self.paths.ssh_dir(),
            &key_slug(name_hint),
            comment,
        )
    }

    pub fn upload_ssh_key(
        &self,
        login: &str,
        private_key_path: &str,
        usage: KeyUsage,
        title: &str,
    ) -> AppResult<UploadOutcome> {
        let key = ssh::read_key(Path::new(private_key_path))?;
        gh::upload_key(self.tools().gh()?, login, &key, usage, title)
    }

    /// Blocking: runs until the browser login finishes, fails, or is cancelled.
    pub fn login(
        &self,
        kind: LoginKind,
        emit: impl Fn(LoginEvent) + Send + Sync + 'static,
    ) -> AppResult<()> {
        let gh = self.tools().gh()?.clone();
        login::run(&gh, kind, &self.logins, emit)
    }

    pub fn cancel_login(&self) {
        self.logins.cancel();
    }

    /// Reports every repository under `root` as it is checked. Returns how many there were.
    pub fn scan_repositories(
        &self,
        root: &Path,
        mut emit: impl FnMut(RepoReport),
    ) -> AppResult<usize> {
        let git = self.tools().git()?.clone();
        let state = self.load()?;
        let repositories = repos::find_repositories(root)?;
        for repo in &repositories {
            if let Ok(facts) = repos::read_facts(&git, repo) {
                emit(repos::diagnose(repo, facts, &state));
            }
        }
        Ok(repositories.len())
    }

    /// Applies a fix and returns the repository's new report with the new snapshot.
    pub fn fix_repository(&self, repo: &Path, fix: RepoFix) -> AppResult<(RepoReport, Snapshot)> {
        let git = self.tools().git()?.clone();
        let snapshot = match fix {
            RepoFix::RemoveLocalIdentity => {
                repos::remove_local_identity(&git, repo)?;
                self.snapshot()?
            }
            RepoFix::PinToProfile { profile_id } => {
                let folder = repo.display().to_string();
                self.change(|state| profiles::pin_folder(state, &profile_id, &folder))?
            }
        };
        let facts = repos::read_facts(&git, repo)?;
        let report = repos::diagnose(repo, facts, &self.load()?);
        Ok((report, snapshot))
    }

    fn change(
        &self,
        apply_change: impl FnOnce(&mut AppState) -> AppResult<()>,
    ) -> AppResult<Snapshot> {
        let _lock = self.lock();
        let mut state = self.load()?;
        apply_change(&mut state)?;
        store::save(&self.paths.state_file(), &state)?;
        config_writer::apply(&self.paths, &state, &self.write_options())?;
        Ok(self.snapshot_of(state))
    }

    fn snapshot_of(&self, state: AppState) -> Snapshot {
        Snapshot {
            guard: GuardStatus {
                enabled: state.guard_enabled,
                conflict: self.guard_conflict(),
            },
            connected: state.connected && config_writer::is_connected(&self.paths),
            profiles: state.profiles,
            active_profile_id: state.active_profile_id,
        }
    }

    fn guard_conflict(&self) -> Option<String> {
        let tools = self.tools();
        let git = tools.git.as_ref()?;
        guard::foreign_hooks_path(git, &self.paths.main_gitconfig())
    }

    fn write_options(&self) -> WriteOptions {
        let tools = self.tools();
        let git_version = tools.git.as_ref().and_then(|git| git.status().version);
        WriteOptions {
            gh_path: tools
                .gh
                .as_ref()
                .map(|gh| crate::paths::to_git_path(gh.path())),
            owner_rules_supported: supports_owner_rules(git_version.as_deref()),
        }
    }

    fn load(&self) -> AppResult<AppState> {
        store::load(&self.paths.state_file())
    }

    fn tools(&self) -> std::sync::RwLockReadGuard<'_, Tools> {
        self.tools.read().unwrap_or_else(|p| p.into_inner())
    }

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.writing.lock().unwrap_or_else(|p| p.into_inner())
    }
}

fn supports_owner_rules(git_version: Option<&str>) -> bool {
    git_version.is_some_and(|version| {
        programs::version_at_least(version, OWNER_RULES_GIT.0, OWNER_RULES_GIT.1)
    })
}

/// A file-name-safe version of a profile name, for `~/.ssh/sentiong_<slug>`.
fn key_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let slug = slug.trim_matches('_').to_string();
    if slug.is_empty() { "key".into() } else { slug }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::models::fixtures::sample_input;

    fn service() -> (tempfile::TempDir, Sentiong) {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().canonicalize().unwrap();
        (dir, Sentiong::new(SentiongPaths::new(home)))
    }

    fn input(label: &str, email: &str) -> ProfileInput {
        ProfileInput {
            label: label.into(),
            github_login: None,
            git_email: email.into(),
            ssh_key_path: None,
            signing: false,
            folders: vec![],
            owners: vec![],
            ..sample_input()
        }
    }

    #[test]
    fn saving_a_profile_writes_git_config_and_reports_it() {
        let (_dir, service) = service();

        let snapshot = service
            .save_profile(None, input("Personal", "me@home.example"))
            .unwrap();

        assert_eq!(snapshot.profiles.len(), 1);
        assert_eq!(snapshot.active_profile_id.as_deref(), Some("personal"));
        assert!(snapshot.connected);
        let profile_config =
            fs::read_to_string(service.paths.profile_gitconfig("personal")).unwrap();
        assert!(profile_config.contains("email = \"me@home.example\""));
    }

    #[test]
    fn activating_switches_the_default_profile() {
        let (_dir, service) = service();
        service
            .save_profile(None, input("Personal", "me@home.example"))
            .unwrap();
        service
            .save_profile(None, input("Work", "me@work.example"))
            .unwrap();

        let snapshot = service.activate_profile("work").unwrap();

        assert_eq!(snapshot.active_profile_id.as_deref(), Some("work"));
        let main = fs::read_to_string(service.paths.main_gitconfig()).unwrap();
        assert!(main.contains("profiles/work.gitconfig"));
        assert!(matches!(
            service.activate_profile("nope"),
            Err(AppError::ProfileNotFound(_))
        ));
    }

    #[test]
    fn invalid_changes_are_not_saved() {
        let (_dir, service) = service();

        assert!(
            service
                .save_profile(None, input("Broken", "not-an-email"))
                .is_err()
        );

        assert!(service.snapshot().unwrap().profiles.is_empty());
        assert!(!service.paths.state_file().exists());
    }

    #[test]
    fn disconnecting_and_reconnecting() {
        let (_dir, service) = service();
        service
            .save_profile(None, input("Personal", "me@home.example"))
            .unwrap();

        let disconnected = service.set_connected(false).unwrap();
        assert!(!disconnected.connected);
        let gitconfig = fs::read_to_string(service.paths.global_gitconfig()).unwrap_or_default();
        assert!(!gitconfig.contains("sentiong"));

        // Editing while disconnected keeps Git untouched.
        service
            .save_profile(Some("personal"), input("Personal", "new@home.example"))
            .unwrap();
        assert!(!config_writer::is_connected(&service.paths));

        assert!(service.set_connected(true).unwrap().connected);
    }

    #[test]
    fn the_guard_can_be_switched_on_and_off() {
        let (_dir, service) = service();
        service
            .save_profile(None, input("Personal", "me@home.example"))
            .unwrap();

        assert!(service.set_guard(true).unwrap().guard.enabled);
        assert!(service.paths.hooks_dir().join("pre-commit").exists());
        assert!(!service.set_guard(false).unwrap().guard.enabled);
        assert!(!service.paths.hooks_dir().exists());
    }

    #[test]
    fn the_guard_refuses_to_replace_another_hooks_path() {
        let (_dir, service) = service();
        fs::write(
            service.paths.global_gitconfig(),
            "[core]\n\thooksPath = ~/.husky-global\n",
        )
        .unwrap();

        let error = service.set_guard(true).unwrap_err();

        assert!(matches!(error, AppError::GuardConflict(_)));
        assert_eq!(
            service.snapshot().unwrap().guard.conflict.as_deref(),
            Some("~/.husky-global")
        );
    }

    #[test]
    fn key_slugs_are_file_name_safe() {
        assert_eq!(key_slug("Work Stuff!"), "work_stuff");
        assert_eq!(key_slug("***"), "key");
    }
}
