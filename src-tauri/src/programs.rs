//! Finding and running the command-line tools Sentiong drives: `git`, `gh`, `ssh-keygen`.
//!
//! Apps launched from Finder or the Start menu do not inherit the shell's `PATH`, so a
//! Homebrew `gh` would be invisible. Discovery therefore also looks in the usual install
//! folders, and every child process gets that extended `PATH`.

use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use crate::error::{AppError, AppResult};
use crate::models::ToolStatus;

#[derive(Debug, Clone)]
pub struct Tools {
    pub git: Option<Program>,
    pub gh: Option<Program>,
    pub ssh_keygen: Option<Program>,
}

impl Tools {
    pub fn discover(home: &Path) -> Self {
        let search_path = search_path(home);
        let find = |name: &'static str| {
            find_in(&search_path, name).map(|path| Program {
                name,
                path,
                search_path: search_path.clone(),
                home: home.to_path_buf(),
            })
        };
        Self {
            git: find("git"),
            gh: find("gh"),
            ssh_keygen: find("ssh-keygen"),
        }
    }

    pub fn git(&self) -> AppResult<&Program> {
        self.git.as_ref().ok_or(AppError::ToolMissing("Git"))
    }

    pub fn gh(&self) -> AppResult<&Program> {
        self.gh
            .as_ref()
            .ok_or(AppError::ToolMissing("GitHub CLI (gh)"))
    }

    pub fn ssh_keygen(&self) -> AppResult<&Program> {
        self.ssh_keygen
            .as_ref()
            .ok_or(AppError::ToolMissing("ssh-keygen"))
    }
}

/// A located executable, ready to run with a predictable environment.
#[derive(Debug, Clone)]
pub struct Program {
    name: &'static str,
    path: PathBuf,
    search_path: OsString,
    home: PathBuf,
}

impl Program {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.path);
        command
            .env("PATH", &self.search_path)
            .env("HOME", &self.home)
            // Plain, stable output: no colors, no update nags, no interactive prompts.
            .env("NO_COLOR", "1")
            .env("GH_NO_UPDATE_NOTIFIER", "1")
            .env("GH_PROMPT_DISABLED", "1")
            .env("GIT_TERMINAL_PROMPT", "0");
        hide_console_window(&mut command);
        command
    }

    /// Runs to completion and returns trimmed stdout, or the tool's own error message.
    pub fn run<I, S>(&self, args: I) -> AppResult<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        command.args(args);
        self.finish(command)
    }

    /// Like `run`, with extra environment variables (for example `GH_TOKEN`).
    pub fn run_with_env<I, S>(&self, args: I, envs: &[(&str, &str)]) -> AppResult<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        command.args(args);
        for (key, value) in envs {
            command.env(key, value);
        }
        self.finish(command)
    }

    /// Runs and returns the raw output, whatever the exit code.
    pub fn output<I, S>(&self, args: I) -> AppResult<Output>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        command.args(args);
        Ok(command.output()?)
    }

    fn finish(&self, mut command: Command) -> AppResult<String> {
        let output = command.output()?;
        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
        Err(AppError::command_failed(
            self.name,
            failure_message(&output),
        ))
    }

    pub fn status(&self) -> ToolStatus {
        let version = self
            .output(["--version"])
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| parse_version(&String::from_utf8_lossy(&output.stdout)));
        ToolStatus {
            found: true,
            path: Some(self.path.display().to_string()),
            version,
        }
    }
}

pub fn missing_tool() -> ToolStatus {
    ToolStatus {
        found: false,
        path: None,
        version: None,
    }
}

/// The most useful line a failed command printed.
pub fn failure_message(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = if stderr.trim().is_empty() {
        stdout
    } else {
        stderr
    };
    let message = text.trim();
    if message.is_empty() {
        format!("exited with {}", output.status)
    } else {
        message.to_string()
    }
}

/// `"git version 2.54.0 (Apple Git-157)"` → `"2.54.0"`.
pub fn parse_version(text: &str) -> Option<String> {
    text.lines().next()?.split_whitespace().find_map(|word| {
        let starts_with_digit = word.chars().next().is_some_and(|c| c.is_ascii_digit());
        (starts_with_digit && word.contains('.')).then(|| word.to_string())
    })
}

/// True when `version` (like `"2.54.0"`) is at least `major.minor`.
pub fn version_at_least(version: &str, major: u32, minor: u32) -> bool {
    let mut parts = version
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0));
    let found = (parts.next().unwrap_or(0), parts.next().unwrap_or(0));
    found >= (major, minor)
}

fn search_path(home: &Path) -> OsString {
    let mut dirs: Vec<PathBuf> = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect())
        .unwrap_or_default();
    for extra in extra_dirs(home) {
        if !dirs.contains(&extra) {
            dirs.push(extra);
        }
    }
    env::join_paths(dirs).unwrap_or_default()
}

#[cfg(windows)]
fn extra_dirs(_home: &Path) -> Vec<PathBuf> {
    let program_files = env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    let system_root = env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    vec![
        program_files.join("Git").join("cmd"),
        program_files.join("GitHub CLI"),
        system_root.join("System32").join("OpenSSH"),
    ]
}

#[cfg(not(windows))]
fn extra_dirs(home: &Path) -> Vec<PathBuf> {
    [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/home/linuxbrew/.linuxbrew/bin",
        "/snap/bin",
        "/usr/bin",
        "/bin",
    ]
    .into_iter()
    .map(PathBuf::from)
    .chain([home.join(".local").join("bin")])
    .collect()
}

fn find_in(search_path: &OsStr, name: &str) -> Option<PathBuf> {
    let file_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    env::split_paths(search_path)
        .map(|dir| dir.join(&file_name))
        .find(|candidate| candidate.is_file())
}

#[cfg(windows)]
fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console_window(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions_from_tool_banners() {
        assert_eq!(
            parse_version("git version 2.54.0 (Apple Git-157)"),
            Some("2.54.0".into())
        );
        assert_eq!(
            parse_version("gh version 2.67.0 (2025-02-11)\nhttps://github.com/cli/cli"),
            Some("2.67.0".into())
        );
        assert_eq!(
            parse_version("git version 2.45.1.windows.1"),
            Some("2.45.1.windows.1".into())
        );
        assert_eq!(parse_version("no numbers here"), None);
    }

    #[test]
    fn compares_versions_by_major_and_minor() {
        assert!(version_at_least("2.36.0", 2, 36));
        assert!(version_at_least("2.54.0", 2, 36));
        assert!(version_at_least("3.0", 2, 36));
        assert!(!version_at_least("2.35.9", 2, 36));
        assert!(!version_at_least("1.99", 2, 36));
    }

    #[test]
    fn finds_git_on_this_machine() {
        let tools = Tools::discover(Path::new("/nonexistent-home"));
        assert!(tools.git.is_some(), "tests need git on PATH");
    }
}
