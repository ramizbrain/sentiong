//! Checking existing repositories: which profile each one really commits with, and
//! fixing the ones that are off.

use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{AppState, RepoReport, RepoStatus};
use crate::profiles;
use crate::programs::Program;

/// Repositories deeper than this below the chosen folder are not looked for.
const MAX_DEPTH: usize = 6;

/// Folders that never contain the user's own repositories but can be enormous.
const SKIPPED_FOLDERS: &[&str] = &[
    "node_modules",
    "vendor",
    "target",
    "Library",
    "AppData",
    "Pods",
    "build",
    "dist",
];

/// Every Git repository under `root`. Nested repositories (submodules, vendored
/// checkouts) are not listed separately.
pub fn find_repositories(root: &Path) -> AppResult<Vec<PathBuf>> {
    if !root.is_dir() {
        return Err(AppError::FolderNotFound(root.display().to_string()));
    }
    let mut repositories = Vec::new();
    let mut walker = WalkDir::new(root)
        .max_depth(MAX_DEPTH)
        .follow_links(false)
        .into_iter();
    while let Some(entry) = walker.next() {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_dir() {
            continue;
        }
        if entry.path().join(".git").exists() {
            repositories.push(entry.path().to_path_buf());
            walker.skip_current_dir();
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        let hidden = name.starts_with('.') && entry.depth() > 0;
        if hidden || SKIPPED_FOLDERS.contains(&name.as_ref()) {
            walker.skip_current_dir();
        }
    }
    repositories.sort();
    Ok(repositories)
}

/// What Git reports for one repository, before comparing it with the profiles.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RepoFacts {
    pub remote_url: Option<String>,
    pub email: Option<String>,
    pub email_is_local: bool,
    pub profile_id: Option<String>,
    pub local_hooks_path: bool,
}

pub fn read_facts(git: &Program, repo: &Path) -> AppResult<RepoFacts> {
    let repo_text = repo.display().to_string();
    let output = git.output([
        "-C",
        &repo_text,
        "config",
        "--show-scope",
        "--get-regexp",
        r"^(user\.email|sentiong\.profile|remote\.origin\.url|core\.hookspath)$",
    ])?;
    // Exit code 1 only means none of the keys is set.
    if !output.status.success() && output.status.code() != Some(1) {
        return Err(AppError::NotARepository(repo_text));
    }
    Ok(parse_facts(&String::from_utf8_lossy(&output.stdout)))
}

/// Parses `git config --show-scope --get-regexp` lines: `scope<TAB>key value`.
/// When a key appears more than once, the last value is the one Git uses.
pub fn parse_facts(text: &str) -> RepoFacts {
    let mut facts = RepoFacts::default();
    for line in text.lines() {
        let Some((scope, rest)) = line.split_once('\t') else {
            continue;
        };
        let (key, value) = rest.split_once(' ').unwrap_or((rest, ""));
        let value = Some(value.to_string());
        match key {
            "user.email" => {
                facts.email = value;
                facts.email_is_local = matches!(scope, "local" | "worktree");
            }
            "sentiong.profile" => facts.profile_id = value,
            "remote.origin.url" => facts.remote_url = value,
            "core.hookspath" => facts.local_hooks_path = matches!(scope, "local" | "worktree"),
            _ => {}
        }
    }
    facts
}

/// Compares what a repository uses with what its owner calls for.
pub fn diagnose(repo: &Path, facts: RepoFacts, state: &AppState) -> RepoReport {
    let owner = facts.remote_url.as_deref().and_then(remote_owner);
    let expected = owner
        .as_deref()
        .and_then(|owner| profiles::for_owner(state, owner));
    let effective = facts
        .profile_id
        .as_deref()
        .and_then(|id| state.profiles.iter().find(|profile| profile.id == id));
    let profile_email = effective.map(|profile| profile.details.git_email.as_str());
    let email_differs_from_profile = match (&facts.email, profile_email) {
        (Some(email), Some(profile_email)) => !email.eq_ignore_ascii_case(profile_email),
        (Some(_), None) => true,
        (None, _) => false,
    };

    let status = if facts.email_is_local && email_differs_from_profile {
        RepoStatus::LocalOverride
    } else if expected.is_some_and(|expected| Some(&expected.id) != facts.profile_id.as_ref()) {
        RepoStatus::WrongProfile
    } else if effective.is_none() {
        RepoStatus::Unmanaged
    } else {
        RepoStatus::Ok
    };

    RepoReport {
        path: repo.display().to_string(),
        name: repo
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| repo.display().to_string()),
        remote_url: facts.remote_url,
        owner,
        email: facts.email,
        effective_profile_id: facts.profile_id,
        expected_profile_id: expected.map(|profile| profile.id.clone()),
        status,
        guard_bypassed: facts.local_hooks_path,
    }
}

/// Removes the repository's own `user.name` / `user.email`, so profile rules apply.
pub fn remove_local_identity(git: &Program, repo: &Path) -> AppResult<()> {
    let repo_text = repo.display().to_string();
    for key in ["user.email", "user.name"] {
        let output = git.output(["-C", &repo_text, "config", "--local", "--unset-all", key])?;
        // Exit code 5: the key was not set, which is fine.
        if !output.status.success() && output.status.code() != Some(5) {
            return Err(AppError::command_failed(
                "git",
                crate::programs::failure_message(&output),
            ));
        }
    }
    Ok(())
}

/// The user or organization a remote URL points at, lowercased.
///
/// `git@github.com:Octo/app.git`, `https://github.com/Octo/app`,
/// `ssh://git@github.com/Octo/app` and `https://me@github.com/Octo/app` all give `octo`.
pub fn remote_owner(url: &str) -> Option<String> {
    let path = if let Some((_, rest)) = url.split_once("://") {
        rest.split_once('/')?.1
    } else if let Some((host, path)) = url.split_once(':') {
        // scp-like syntax; a Windows drive letter (C:\...) is a local path.
        if host.len() <= 1 || host.contains('/') {
            return None;
        }
        path
    } else {
        return None;
    };
    let owner = path.trim_start_matches('/').split('/').next()?;
    (!owner.is_empty() && owner != "..").then(|| owner.to_lowercase())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::models::fixtures::plain_profile;
    use crate::models::{Profile, STATE_VERSION};

    fn state() -> AppState {
        let mut work: Profile = plain_profile("work", "me@work.example");
        work.details.owners = vec!["Octo-Org".into()];
        AppState {
            version: STATE_VERSION,
            profiles: vec![plain_profile("personal", "me@home.example"), work],
            active_profile_id: Some("personal".into()),
            guard_enabled: true,
            connected: true,
        }
    }

    fn facts(remote: &str, email: &str, local: bool, profile: &str) -> RepoFacts {
        RepoFacts {
            remote_url: Some(remote.into()),
            email: Some(email.into()),
            email_is_local: local,
            profile_id: Some(profile.into()),
            local_hooks_path: false,
        }
    }

    #[test]
    fn reads_owners_from_every_url_style() {
        for url in [
            "git@github.com:Octo-Org/app.git",
            "https://github.com/Octo-Org/app",
            "https://me@github.com/octo-org/app.git",
            "ssh://git@github.com/octo-org/app",
            "git@github-work:octo-org/app.git",
        ] {
            assert_eq!(remote_owner(url).as_deref(), Some("octo-org"), "{url}");
        }
        assert_eq!(remote_owner("/srv/git/app.git"), None);
        assert_eq!(remote_owner(r"C:\repos\app"), None);
        assert_eq!(remote_owner("../app"), None);
    }

    #[test]
    fn parses_git_config_output_with_scopes() {
        let text = "global\tuser.email me@home.example\n\
                    global\tsentiong.profile personal\n\
                    local\tremote.origin.url git@github.com:octo-org/app.git\n\
                    local\tuser.email old@laptop.example\n\
                    local\tcore.hookspath .husky\n";

        let facts = parse_facts(text);

        assert_eq!(facts.email.as_deref(), Some("old@laptop.example"));
        assert!(facts.email_is_local);
        assert_eq!(facts.profile_id.as_deref(), Some("personal"));
        assert!(facts.local_hooks_path);
    }

    #[test]
    fn classifies_repositories() {
        let state = state();
        let status = |facts: RepoFacts| diagnose(Path::new("/code/app"), facts, &state).status;

        assert_eq!(
            status(facts(
                "git@github.com:octo-org/a",
                "me@work.example",
                false,
                "work"
            )),
            RepoStatus::Ok
        );
        assert_eq!(
            status(facts(
                "git@github.com:octo-org/a",
                "old@x.example",
                true,
                "work"
            )),
            RepoStatus::LocalOverride
        );
        // A local email equal to the profile's is harmless.
        assert_eq!(
            status(facts(
                "git@github.com:octo-org/a",
                "ME@work.example",
                true,
                "work"
            )),
            RepoStatus::Ok
        );
        assert_eq!(
            status(facts(
                "git@github.com:octo-org/a",
                "me@home.example",
                false,
                "personal"
            )),
            RepoStatus::WrongProfile
        );
        assert_eq!(
            status(facts(
                "git@github.com:someone/a",
                "me@home.example",
                false,
                "personal"
            )),
            RepoStatus::Ok
        );
        assert_eq!(status(RepoFacts::default()), RepoStatus::Unmanaged);
    }

    #[test]
    fn a_report_names_the_expected_profile() {
        let report = diagnose(
            Path::new("/code/app"),
            facts(
                "https://github.com/Octo-Org/app",
                "me@home.example",
                false,
                "personal",
            ),
            &state(),
        );

        assert_eq!(report.name, "app");
        assert_eq!(report.owner.as_deref(), Some("octo-org"));
        assert_eq!(report.expected_profile_id.as_deref(), Some("work"));
        assert_eq!(report.effective_profile_id.as_deref(), Some("personal"));
    }

    #[test]
    fn finds_repositories_but_not_inside_dependencies_or_other_repositories() {
        let root = tempfile::tempdir().unwrap();
        for dir in [
            "a/.git",
            "a/vendor/inner/.git",
            "group/b/.git",
            "node_modules/pkg/.git",
            ".hidden/c/.git",
        ] {
            fs::create_dir_all(root.path().join(dir)).unwrap();
        }
        // Worktrees and submodules have a `.git` file instead of a folder.
        fs::create_dir_all(root.path().join("worktree")).unwrap();
        fs::write(root.path().join("worktree/.git"), "gitdir: /elsewhere").unwrap();

        let found = find_repositories(root.path()).unwrap();
        let names: Vec<_> = found
            .iter()
            .map(|path| {
                path.strip_prefix(root.path())
                    .unwrap()
                    .display()
                    .to_string()
            })
            .collect();

        assert_eq!(names, ["a", "group/b", "worktree"]);
    }

    #[test]
    fn a_missing_root_is_an_error() {
        assert!(matches!(
            find_repositories(Path::new("/definitely/not/here")),
            Err(AppError::FolderNotFound(_))
        ));
    }
}
