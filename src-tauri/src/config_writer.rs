//! Turns `AppState` into files: one gitconfig per profile, `sentiong.gitconfig`, the
//! include block in `~/.gitconfig`, and the guard's hooks. Applying is idempotent, and
//! `~/.gitconfig` is backed up before every change Sentiong makes to it.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppResult;
use crate::gitconfig::{self, RenderContext};
use crate::guard;
use crate::models::AppState;
use crate::paths::{SentiongPaths, to_git_path};
use crate::store::write_atomically;

/// How many `~/.gitconfig` backups to keep.
const BACKUPS_KEPT: usize = 10;

pub struct WriteOptions {
    pub gh_path: Option<String>,
    pub owner_rules_supported: bool,
}

pub fn apply(paths: &SentiongPaths, state: &AppState, options: &WriteOptions) -> AppResult<()> {
    if !state.connected {
        return disconnect(paths);
    }
    let context = RenderContext {
        gh_path: options.gh_path.clone(),
        owner_rules_supported: options.owner_rules_supported,
        case_insensitive_paths: cfg!(any(windows, target_os = "macos")),
        hooks_path: state.guard_enabled.then(|| to_git_path(&paths.hooks_dir())),
    };

    write_profiles(paths, state, &context)?;
    let profile_path = |id: &str| to_git_path(&paths.profile_gitconfig(id));
    write_if_changed(
        &paths.main_gitconfig(),
        &gitconfig::render_main(state, profile_path, &context),
    )?;

    if state.guard_enabled {
        guard::install(&paths.hooks_dir())?;
    } else {
        guard::uninstall(&paths.hooks_dir())?;
    }

    let block = gitconfig::managed_block(&to_git_path(&paths.main_gitconfig()));
    update_global_gitconfig(paths, |existing| {
        gitconfig::upsert_managed_block(existing, &block)
    })
}

/// Takes Sentiong out of Git entirely: the include block and the hooks. Profiles stay
/// saved in the app, so applying again restores everything.
pub fn disconnect(paths: &SentiongPaths) -> AppResult<()> {
    update_global_gitconfig(paths, gitconfig::remove_managed_block)?;
    guard::uninstall(&paths.hooks_dir())
}

/// True when `~/.gitconfig` currently includes Sentiong.
pub fn is_connected(paths: &SentiongPaths) -> bool {
    fs::read_to_string(paths.global_gitconfig())
        .is_ok_and(|text| text.contains(gitconfig::BLOCK_START))
}

fn write_profiles(
    paths: &SentiongPaths,
    state: &AppState,
    context: &RenderContext,
) -> AppResult<()> {
    fs::create_dir_all(paths.profiles_dir())?;
    for profile in &state.profiles {
        write_if_changed(
            &paths.profile_gitconfig(&profile.id),
            &gitconfig::render_profile(profile, context),
        )?;
    }
    // Files of deleted profiles would otherwise linger forever.
    for entry in fs::read_dir(paths.profiles_dir())?.filter_map(Result::ok) {
        let path = entry.path();
        let id = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string());
        let is_profile_file = path
            .extension()
            .is_some_and(|extension| extension == "gitconfig");
        if is_profile_file
            && !state
                .profiles
                .iter()
                .any(|profile| Some(&profile.id) == id.as_ref())
        {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn update_global_gitconfig(
    paths: &SentiongPaths,
    change: impl Fn(&str) -> String,
) -> AppResult<()> {
    let path = paths.global_gitconfig();
    let existing = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let updated = change(&existing);
    if updated == existing {
        return Ok(());
    }
    if !existing.is_empty() {
        back_up(paths, &existing)?;
    }
    write_atomically(&path, &updated)
}

fn back_up(paths: &SentiongPaths, contents: &str) -> AppResult<()> {
    let dir = paths.backups_dir();
    fs::create_dir_all(&dir)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    fs::write(dir.join(format!("gitconfig-{stamp}.bak")), contents)?;

    let mut backups: Vec<_> = fs::read_dir(&dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("gitconfig-"))
        })
        .collect();
    backups.sort();
    let excess = backups.len().saturating_sub(BACKUPS_KEPT);
    for old in &backups[..excess] {
        fs::remove_file(old)?;
    }
    Ok(())
}

fn write_if_changed(path: &Path, contents: &str) -> AppResult<()> {
    if fs::read_to_string(path).is_ok_and(|existing| existing == contents) {
        return Ok(());
    }
    write_atomically(path, contents)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::models::fixtures::plain_profile;
    use crate::models::{Profile, STATE_VERSION};
    use crate::programs::{Program, Tools};

    struct Home {
        _dir: tempfile::TempDir,
        paths: SentiongPaths,
        git: Program,
    }

    impl Home {
        fn new() -> Self {
            let dir = tempfile::tempdir().unwrap();
            let home = dir.path().canonicalize().unwrap();
            let git = Tools::discover(&home).git.expect("tests need git");
            Self {
                _dir: dir,
                paths: SentiongPaths::new(home),
                git,
            }
        }

        fn repo(&self, relative: &str, remote: Option<&str>) -> PathBuf {
            let repo = self.paths.home().join(relative);
            fs::create_dir_all(&repo).unwrap();
            self.git_in(&repo, &["init", "-q"]);
            if let Some(remote) = remote {
                self.git_in(&repo, &["remote", "add", "origin", remote]);
            }
            repo
        }

        fn git_in(&self, repo: &Path, args: &[&str]) -> String {
            let mut command = self.git.command();
            command
                .current_dir(repo)
                .args(args)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("XDG_CONFIG_HOME", self.paths.home().join(".config"));
            String::from_utf8_lossy(&command.output().unwrap().stdout)
                .trim()
                .to_string()
        }
    }

    fn options() -> WriteOptions {
        WriteOptions {
            gh_path: None,
            owner_rules_supported: true,
        }
    }

    fn state(home: &Path) -> AppState {
        let personal = plain_profile("personal", "me@home.example");
        let mut work: Profile = plain_profile("work", "me@work.example");
        work.details.folders = vec![home.join("work").display().to_string()];
        work.details.owners = vec!["Octo-Org".into()];
        AppState {
            version: STATE_VERSION,
            profiles: vec![personal, work],
            active_profile_id: Some("personal".into()),
            guard_enabled: false,
            connected: true,
        }
    }

    #[test]
    fn git_picks_the_profile_by_folder_owner_or_default() {
        let home = Home::new();
        fs::write(
            home.paths.global_gitconfig(),
            "[user]\n\temail = old@example.com\n",
        )
        .unwrap();

        apply(&home.paths, &state(home.paths.home()), &options()).unwrap();

        let in_work_folder = home.repo("work/app", None);
        let owned_by_org = home.repo("elsewhere/app", Some("git@github.com:octo-org/app.git"));
        let anything_else = home.repo("elsewhere/other", Some("https://github.com/someone/app"));
        assert_eq!(
            home.git_in(&in_work_folder, &["config", "user.email"]),
            "me@work.example"
        );
        assert_eq!(
            home.git_in(&owned_by_org, &["config", "user.email"]),
            "me@work.example"
        );
        assert_eq!(
            home.git_in(&anything_else, &["config", "user.email"]),
            "me@home.example"
        );
        assert_eq!(
            home.git_in(&owned_by_org, &["config", "sentiong.profile"]),
            "work"
        );
    }

    #[test]
    fn applying_twice_changes_nothing_and_keeps_one_backup() {
        let home = Home::new();
        fs::write(
            home.paths.global_gitconfig(),
            "[user]\n\temail = old@example.com\n",
        )
        .unwrap();
        let state = state(home.paths.home());

        apply(&home.paths, &state, &options()).unwrap();
        let first = fs::read_to_string(home.paths.global_gitconfig()).unwrap();
        apply(&home.paths, &state, &options()).unwrap();

        assert_eq!(
            fs::read_to_string(home.paths.global_gitconfig()).unwrap(),
            first
        );
        assert!(first.starts_with("[user]\n\temail = old@example.com\n"));
        let backups: Vec<_> = fs::read_dir(home.paths.backups_dir()).unwrap().collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn deleted_profiles_lose_their_files() {
        let home = Home::new();
        let mut state = state(home.paths.home());
        apply(&home.paths, &state, &options()).unwrap();
        assert!(home.paths.profile_gitconfig("work").exists());

        state.profiles.retain(|profile| profile.id != "work");
        apply(&home.paths, &state, &options()).unwrap();

        assert!(!home.paths.profile_gitconfig("work").exists());
        assert!(home.paths.profile_gitconfig("personal").exists());
    }

    #[test]
    fn the_guard_follows_the_state() {
        let home = Home::new();
        let mut state = state(home.paths.home());
        state.guard_enabled = true;

        apply(&home.paths, &state, &options()).unwrap();
        assert!(home.paths.hooks_dir().join("pre-commit").exists());
        let repo = home.repo("elsewhere/app", None);
        assert_eq!(
            home.git_in(&repo, &["config", "core.hooksPath"]),
            to_git_path(&home.paths.hooks_dir())
        );

        state.guard_enabled = false;
        apply(&home.paths, &state, &options()).unwrap();
        assert!(!home.paths.hooks_dir().exists());
    }

    #[test]
    fn disconnecting_restores_the_original_gitconfig() {
        let home = Home::new();
        let original = "[user]\n\temail = old@example.com\n";
        fs::write(home.paths.global_gitconfig(), original).unwrap();
        apply(&home.paths, &state(home.paths.home()), &options()).unwrap();
        assert!(is_connected(&home.paths));

        disconnect(&home.paths).unwrap();

        assert_eq!(
            fs::read_to_string(home.paths.global_gitconfig()).unwrap(),
            original
        );
        assert!(!is_connected(&home.paths));
    }
}
