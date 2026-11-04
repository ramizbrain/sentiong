use std::path::{Path, PathBuf};

/// Every location Sentiong reads or writes, derived from one home directory.
/// Tests point it at a temporary folder, so they never touch the real config.
#[derive(Debug, Clone)]
pub struct SentiongPaths {
    home: PathBuf,
    root: PathBuf,
}

impl SentiongPaths {
    pub fn new(home: impl Into<PathBuf>) -> Self {
        let home = home.into();
        let root = home.join(".config").join("sentiong");
        Self { home, root }
    }

    pub fn home(&self) -> &Path {
        &self.home
    }

    /// The user's global Git config, where Sentiong adds its single include block.
    pub fn global_gitconfig(&self) -> PathBuf {
        self.home.join(".gitconfig")
    }

    pub fn ssh_dir(&self) -> PathBuf {
        self.home.join(".ssh")
    }

    pub fn state_file(&self) -> PathBuf {
        self.root.join("state.json")
    }

    /// The file `~/.gitconfig` includes: default profile, rules, and guard data.
    pub fn main_gitconfig(&self) -> PathBuf {
        self.root.join("git").join("sentiong.gitconfig")
    }

    pub fn profiles_dir(&self) -> PathBuf {
        self.root.join("git").join("profiles")
    }

    pub fn profile_gitconfig(&self, profile_id: &str) -> PathBuf {
        self.profiles_dir().join(format!("{profile_id}.gitconfig"))
    }

    pub fn hooks_dir(&self) -> PathBuf {
        self.root.join("hooks")
    }

    pub fn backups_dir(&self) -> PathBuf {
        self.root.join("backups")
    }
}

/// Git config files are happiest with forward slashes, on Windows too.
pub fn to_git_path(path: &Path) -> String {
    path.display().to_string().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn everything_lives_under_the_home_directory() {
        let paths = SentiongPaths::new("/home/octo");

        assert_eq!(paths.global_gitconfig(), Path::new("/home/octo/.gitconfig"));
        assert_eq!(
            paths.profile_gitconfig("work"),
            Path::new("/home/octo/.config/sentiong/git/profiles/work.gitconfig")
        );
        assert_eq!(
            paths.hooks_dir(),
            Path::new("/home/octo/.config/sentiong/hooks")
        );
    }

    #[test]
    fn git_paths_use_forward_slashes() {
        assert_eq!(
            to_git_path(Path::new(r"C:\Users\octo\work")),
            "C:/Users/octo/work"
        );
    }
}
