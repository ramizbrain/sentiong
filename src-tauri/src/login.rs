//! Browser logins through `gh`'s device flow: `gh auth login --web` (a new account) and
//! `gh auth refresh` (extra permissions for an existing one).
//!
//! Run without a terminal, gh prints a one-time code and a URL, then waits until the
//! code is entered on github.com. Sentiong shows the code in its own UI.

use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::gh::{self, HOST, KEY_SCOPES};
use crate::models::LoginEvent;
use crate::programs::Program;

pub const DEFAULT_VERIFICATION_URL: &str = "https://github.com/login/device";

pub enum LoginKind {
    /// Add another account to gh.
    NewAccount,
    /// Ask GitHub for the key-upload scopes on an account gh already knows.
    GrantKeyScopes { login: String },
}

/// The single login that may run at a time, so it can be cancelled from the UI.
#[derive(Default)]
pub struct LoginRegistry {
    child: Mutex<Option<Child>>,
}

impl LoginRegistry {
    pub fn cancel(&self) {
        if let Some(mut child) = self.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Spawns `command` as the running login and hands back its output streams.
    fn start(&self, mut command: Command) -> AppResult<Vec<Box<dyn Read + Send>>> {
        let mut slot = self.lock();
        if slot.is_some() {
            return Err(AppError::LoginInProgress);
        }
        let mut child = command.spawn()?;
        if let Some(mut stdin) = child.stdin.take() {
            // Device-flow logins never need input; a newline just unblocks any prompt.
            let _ = stdin.write_all(b"\n");
        }
        let mut streams: Vec<Box<dyn Read + Send>> = Vec::new();
        if let Some(stderr) = child.stderr.take() {
            streams.push(Box::new(stderr));
        }
        if let Some(stdout) = child.stdout.take() {
            streams.push(Box::new(stdout));
        }
        *slot = Some(child);
        Ok(streams)
    }

    /// `Some(success)` once gh exits, `None` when the login was cancelled.
    fn wait(&self) -> Option<bool> {
        loop {
            {
                let mut slot = self.lock();
                let child = slot.as_mut()?;
                let finished = match child.try_wait() {
                    Ok(Some(status)) => Some(status.success()),
                    Ok(None) => None,
                    Err(_) => Some(false),
                };
                if let Some(success) = finished {
                    slot.take();
                    return Some(success);
                }
            }
            thread::sleep(Duration::from_millis(200));
        }
    }

    fn lock(&self) -> MutexGuard<'_, Option<Child>> {
        self.child
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Runs a login to the end, reporting progress through `emit`. Blocking.
///
/// gh makes a freshly logged-in account the active one; Sentiong switches back to the
/// account that was active before, because switching is the user's call.
pub fn run(
    gh: &Program,
    kind: LoginKind,
    registry: &LoginRegistry,
    emit: impl Fn(LoginEvent) + Send + Sync + 'static,
) -> AppResult<()> {
    let previously_active = gh::active_login(gh).ok().flatten();
    let scopes = KEY_SCOPES.join(",");

    let args: Vec<&str> = match &kind {
        LoginKind::NewAccount => vec![
            "auth",
            "login",
            "--hostname",
            HOST,
            "--web",
            "--skip-ssh-key",
            "--scopes",
            &scopes,
        ],
        LoginKind::GrantKeyScopes { login } => {
            gh::switch(gh, login)?;
            vec!["auth", "refresh", "--hostname", HOST, "--scopes", &scopes]
        }
    };

    let result = run_device_flow(gh, &args, registry, Arc::new(emit));

    if let Some(previous) = &previously_active {
        let _ = gh::switch(gh, previous);
    }
    result
}

fn run_device_flow(
    gh: &Program,
    args: &[&str],
    registry: &LoginRegistry,
    emit: Arc<dyn Fn(LoginEvent) + Send + Sync>,
) -> AppResult<()> {
    let mut command = gh.command();
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let streams = registry.start(command)?;

    let transcript = Arc::new(Mutex::new(String::new()));
    let announced = Arc::new(AtomicBool::new(false));
    let readers: Vec<_> = streams
        .into_iter()
        .map(|stream| {
            let (emit, transcript, announced) =
                (emit.clone(), transcript.clone(), announced.clone());
            thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    if let Some(code) = one_time_code(&line)
                        && !announced.swap(true, Ordering::SeqCst)
                    {
                        emit(LoginEvent::Code {
                            code,
                            verification_url: DEFAULT_VERIFICATION_URL.into(),
                        });
                    }
                    let mut text = transcript.lock().unwrap_or_else(|p| p.into_inner());
                    text.push_str(&line);
                    text.push('\n');
                }
            })
        })
        .collect();

    let outcome = registry.wait();
    for reader in readers {
        let _ = reader.join();
    }
    let text = transcript.lock().unwrap_or_else(|p| p.into_inner()).clone();
    emit(match outcome {
        None => LoginEvent::Cancelled,
        Some(true) => LoginEvent::Completed {
            login: logged_in_as(&text),
        },
        Some(false) => LoginEvent::Failed {
            message: last_meaningful_line(&text).unwrap_or_else(|| "GitHub login failed.".into()),
        },
    });
    Ok(())
}

/// gh's one-time codes look like `ABCD-1234`.
fn one_time_code(line: &str) -> Option<String> {
    line.split_whitespace()
        .map(|word| word.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-'))
        .find(|word| {
            let bytes = word.as_bytes();
            bytes.len() == 9
                && bytes[4] == b'-'
                && bytes
                    .iter()
                    .enumerate()
                    .all(|(i, b)| i == 4 || b.is_ascii_uppercase() || b.is_ascii_digit())
        })
        .map(String::from)
}

/// `"✓ Logged in as octocat"` → `octocat`.
fn logged_in_as(transcript: &str) -> Option<String> {
    transcript
        .lines()
        .find_map(|line| line.split_once("Logged in as ").map(|(_, rest)| rest))
        .and_then(|rest| rest.split_whitespace().next())
        .map(|login| login.trim_end_matches('.').to_string())
}

fn last_meaningful_line(transcript: &str) -> Option<String> {
    transcript
        .lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_one_time_codes() {
        assert_eq!(
            one_time_code("! First copy your one-time code: AB12-CD34"),
            Some("AB12-CD34".into())
        );
        assert_eq!(one_time_code("Press Enter to open github.com"), None);
        assert_eq!(one_time_code("code: ab12-cd34"), None);
    }

    #[test]
    fn reads_the_new_login_from_the_transcript() {
        let transcript = "✓ Authentication complete.\n✓ Logged in as octo-work\n";
        assert_eq!(logged_in_as(transcript), Some("octo-work".into()));
        assert_eq!(logged_in_as("nothing"), None);
    }
}
