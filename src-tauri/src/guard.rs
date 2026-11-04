//! The wrong-account guard: a global `pre-commit` hook that refuses a commit when the
//! repository's owner is linked to a profile whose email is not the one in effect.
//!
//! A global `core.hooksPath` replaces each repository's `.git/hooks`, so every hook
//! Sentiong installs hands over to the repository's own hook of the same name. Hooks
//! from tools like Git LFS keep working.

use std::fs;
use std::path::Path;

use crate::error::AppResult;
use crate::programs::Program;

/// Hooks forwarded to the repository. Very chatty hooks (`reference-transaction`,
/// `post-index-change`) are left out because they would slow down every Git command.
pub const HOOK_NAMES: &[&str] = &[
    "applypatch-msg",
    "pre-applypatch",
    "post-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-push",
    "post-rewrite",
    "pre-auto-gc",
    "push-to-checkout",
    "sendemail-validate",
    "pre-receive",
    "update",
    "proc-receive",
    "post-receive",
    "post-update",
];

/// Environment variable that lets a single commit through.
pub const SKIP_VARIABLE: &str = "SENTIONG_SKIP";

/// The same POSIX script is installed under every hook name; it looks at `$0` to
/// know which hook it is.
pub fn hook_script() -> String {
    format!(
        r#"#!/bin/sh
# Managed by Sentiong: checks the commit identity, then runs the repository's own hook.
hook=$(basename "$0")

lower() {{ printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }}

if [ "$hook" = "pre-commit" ] && [ -z "${skip}" ]; then
  remote=$(git remote get-url origin 2>/dev/null)
  owner=$(lower "$(printf '%s' "$remote" | sed -E 's#^[A-Za-z+]+://[^/]+/##; s#^[^@/]+@[^:/]+:##; s#/.*$##')")
  expected=""
  if [ -n "$owner" ]; then
    expected=$(git config --get "sentiong.owner.$owner.email" 2>/dev/null)
  fi
  if [ -n "$expected" ]; then
    current=$(git config --get user.email)
    if [ "$(lower "$current")" != "$(lower "$expected")" ]; then
      label=$(git config --get "sentiong.owner.$owner.label" 2>/dev/null)
      {{
        echo ""
        echo "Sentiong stopped this commit."
        echo "  This repository belongs to $owner, which uses your \"$label\" profile ($expected),"
        echo "  but the commit would be made as ${{current:-an unset email}}."
        echo ""
        echo "  Fix it with Sentiong > Check repositories, or commit anyway with:"
        echo "    {skip}=1 git commit ..."
        echo ""
      }} >&2
      exit 1
    fi
  fi
fi

repo_hook="$(git rev-parse --git-common-dir 2>/dev/null)/hooks/$hook"
if [ -x "$repo_hook" ]; then
  exec "$repo_hook" "$@"
fi
exit 0
"#,
        skip = SKIP_VARIABLE
    )
}

/// Writes every hook into `hooks_dir`, replacing what was there.
pub fn install(hooks_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(hooks_dir)?;
    let script = hook_script();
    for name in HOOK_NAMES {
        let path = hooks_dir.join(name);
        fs::write(&path, &script)?;
        make_executable(&path)?;
    }
    Ok(())
}

/// Removes the hooks folder. Safe to call when it does not exist.
pub fn uninstall(hooks_dir: &Path) -> AppResult<()> {
    match fs::remove_dir_all(hooks_dir) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}

/// A `core.hooksPath` set globally by someone other than Sentiong. Turning the guard
/// on would silently replace it, so that is refused instead.
pub fn foreign_hooks_path(git: &Program, sentiong_config: &Path) -> Option<String> {
    let output = git
        .output([
            "config",
            "--global",
            "--show-origin",
            "--get-all",
            "core.hooksPath",
        ])
        .ok()?;
    let ours = file_name_suffix(sentiong_config);
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .find(|(origin, _)| !origin.replace('\\', "/").ends_with(&ours))
        .map(|(_, value)| value.to_string())
}

/// `.../sentiong/git/sentiong.gitconfig`: enough to recognize our file in Git's output.
fn file_name_suffix(path: &Path) -> String {
    let parts: Vec<_> = path
        .components()
        .rev()
        .take(3)
        .map(|part| part.as_os_str().to_string_lossy().to_string())
        .collect();
    parts.into_iter().rev().collect::<Vec<_>>().join("/")
}

#[cfg(unix)]
fn make_executable(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> AppResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::process::Output;

    use super::*;
    use crate::programs::Tools;

    /// A throwaway home with a global config that enables the guard and links
    /// `octo-org` to `me@work.example`.
    struct Sandbox {
        _dir: tempfile::TempDir,
        home: PathBuf,
        git: Program,
    }

    impl Sandbox {
        fn new() -> Self {
            let dir = tempfile::tempdir().unwrap();
            let home = dir.path().canonicalize().unwrap();
            let hooks = home.join("hooks");
            install(&hooks).unwrap();
            fs::write(
                home.join(".gitconfig"),
                format!(
                    "[user]\n\tname = Octo\n\temail = me@home.example\n\
                     [core]\n\thooksPath = {}\n\
                     [sentiong \"owner.octo-org\"]\n\tprofile = work\n\tlabel = Work\n\temail = me@work.example\n",
                    hooks.display()
                ),
            )
            .unwrap();
            let git = Tools::discover(&home).git.expect("tests need git");
            Self {
                _dir: dir,
                home,
                git,
            }
        }

        fn repo(&self, name: &str, remote: &str) -> PathBuf {
            let repo = self.home.join(name);
            fs::create_dir_all(&repo).unwrap();
            self.git_in(&repo, &["init", "-q"]);
            self.git_in(&repo, &["remote", "add", "origin", remote]);
            repo
        }

        fn git_in(&self, repo: &Path, args: &[&str]) -> Output {
            let mut command = self.git.command();
            command
                .current_dir(repo)
                .args(args)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("XDG_CONFIG_HOME", self.home.join(".config"));
            command.output().unwrap()
        }

        fn commit(&self, repo: &Path) -> Output {
            self.git_in(repo, &["commit", "-q", "--allow-empty", "-m", "test"])
        }
    }

    #[test]
    fn installs_an_executable_script_for_every_hook() {
        let dir = tempfile::tempdir().unwrap();
        install(dir.path()).unwrap();

        for name in HOOK_NAMES {
            let script = fs::read_to_string(dir.path().join(name)).unwrap();
            assert!(script.starts_with("#!/bin/sh\n"));
        }
        uninstall(dir.path()).unwrap();
        assert!(!dir.path().exists());
        uninstall(dir.path()).unwrap();
    }

    #[test]
    fn blocks_a_commit_made_with_the_wrong_email() {
        let sandbox = Sandbox::new();
        let repo = sandbox.repo("work-app", "git@github.com:Octo-Org/app.git");

        let output = sandbox.commit(&repo);

        assert!(!output.status.success());
        let message = String::from_utf8_lossy(&output.stderr);
        assert!(
            message.contains("Sentiong stopped this commit."),
            "{message}"
        );
        assert!(message.contains("\"Work\" profile (me@work.example)"));
        assert!(message.contains("me@home.example"));
    }

    #[test]
    fn allows_the_right_email_unknown_owners_and_explicit_skips() {
        let sandbox = Sandbox::new();
        let work = sandbox.repo("work-app", "https://github.com/octo-org/app.git");
        sandbox.git_in(&work, &["config", "user.email", "ME@work.example"]);
        assert!(sandbox.commit(&work).status.success());

        let other = sandbox.repo("other", "https://github.com/someone-else/app.git");
        assert!(sandbox.commit(&other).status.success());

        let no_remote = sandbox.home.join("scratch");
        fs::create_dir_all(&no_remote).unwrap();
        sandbox.git_in(&no_remote, &["init", "-q"]);
        assert!(sandbox.commit(&no_remote).status.success());

        let blocked = sandbox.repo("blocked", "git@github.com:octo-org/x.git");
        let mut command = sandbox.git.command();
        command
            .current_dir(&blocked)
            .args(["commit", "-q", "--allow-empty", "-m", "skip"])
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("XDG_CONFIG_HOME", sandbox.home.join(".config"))
            .env(SKIP_VARIABLE, "1");
        assert!(command.output().unwrap().status.success());
    }

    #[cfg(unix)]
    #[test]
    fn hands_over_to_the_repositorys_own_hook() {
        let sandbox = Sandbox::new();
        let repo = sandbox.repo("app", "https://github.com/someone-else/app.git");
        let own_hook = repo.join(".git/hooks/pre-commit");
        fs::write(&own_hook, "#!/bin/sh\necho 'repo hook ran' >&2\nexit 3\n").unwrap();
        make_executable(&own_hook).unwrap();

        let output = sandbox.commit(&repo);

        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("repo hook ran"));
    }

    #[test]
    fn spots_a_hooks_path_owned_by_another_tool() {
        let sandbox = Sandbox::new();
        let ours = sandbox.home.join(".config/sentiong/git/sentiong.gitconfig");

        assert!(foreign_hooks_path(&sandbox.git, &ours).is_some());

        fs::create_dir_all(ours.parent().unwrap()).unwrap();
        fs::write(&ours, "[core]\n\thooksPath = /ours\n").unwrap();
        fs::write(
            sandbox.home.join(".gitconfig"),
            format!("[include]\n\tpath = {}\n", ours.display()),
        )
        .unwrap();
        assert_eq!(foreign_hooks_path(&sandbox.git, &ours), None);
    }
}
