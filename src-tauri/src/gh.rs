//! Everything Sentiong asks of the GitHub CLI. Tokens never leave `gh`'s own store:
//! calls for a specific account pass its token to `gh` through `GH_TOKEN`, in memory.

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{GhAccount, GithubUser, KeyUsage, SshKey, UploadOutcome};
use crate::programs::Program;
use crate::ssh;

pub const HOST: &str = "github.com";

/// Scopes the browser login asks for, on top of gh's defaults, so Sentiong can
/// upload SSH authentication and signing keys.
pub const KEY_SCOPES: &[&str] = &["admin:public_key", "admin:ssh_signing_key"];

pub fn accounts(gh: &Program) -> AppResult<Vec<GhAccount>> {
    // `gh auth status` exits non-zero when any token is invalid, but still lists them all.
    let output = gh.output(["auth", "status", "--hostname", HOST])?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(parse_status(&text))
}

pub fn active_login(gh: &Program) -> AppResult<Option<String>> {
    Ok(accounts(gh)?
        .into_iter()
        .find(|account| account.active)
        .map(|account| account.login))
}

pub fn switch(gh: &Program, login: &str) -> AppResult<()> {
    gh.run(["auth", "switch", "--hostname", HOST, "--user", login])?;
    Ok(())
}

pub fn user(gh: &Program, login: &str) -> AppResult<GithubUser> {
    #[derive(Deserialize)]
    struct ApiUser {
        login: String,
        id: u64,
        name: Option<String>,
        email: Option<String>,
        avatar_url: String,
    }
    #[derive(Deserialize)]
    struct ApiOrganization {
        login: String,
    }

    let user: ApiUser = api(gh, login, "user")?;
    // Listing organizations needs `read:org`; a profile works fine without them.
    let organizations: Vec<ApiOrganization> = api(gh, login, "user/orgs").unwrap_or_default();

    Ok(GithubUser {
        noreply_email: format!("{}+{}@users.noreply.github.com", user.id, user.login),
        login: user.login,
        id: user.id,
        name: user.name.filter(|name| !name.trim().is_empty()),
        public_email: user.email.filter(|email| !email.trim().is_empty()),
        avatar_url: user.avatar_url,
        organizations: organizations.into_iter().map(|org| org.login).collect(),
    })
}

/// Adds `key` to the account unless it is already there.
pub fn upload_key(
    gh: &Program,
    login: &str,
    key: &SshKey,
    usage: KeyUsage,
    title: &str,
) -> AppResult<UploadOutcome> {
    let account = accounts(gh)?
        .into_iter()
        .find(|account| account.login.eq_ignore_ascii_case(login))
        .ok_or_else(|| AppError::command_failed("gh", format!("not logged in to {login}")))?;
    ensure_scope(&account, usage)?;

    #[derive(Deserialize)]
    struct ApiKey {
        key: String,
    }
    let (list_path, type_flag) = match usage {
        KeyUsage::Authentication => ("user/keys", "authentication"),
        KeyUsage::Signing => ("user/ssh_signing_keys", "signing"),
    };
    let existing: Vec<ApiKey> = api(gh, login, list_path)?;
    if existing
        .iter()
        .any(|existing| ssh::same_key(&existing.key, &key.public_key))
    {
        return Ok(UploadOutcome {
            already_present: true,
        });
    }

    let public_path = ssh::public_key_path(std::path::Path::new(&key.private_key_path));
    let token = token(gh, login)?;
    gh.run_with_env(
        [
            "ssh-key",
            "add",
            &public_path.display().to_string(),
            "--title",
            title,
            "--type",
            type_flag,
        ],
        &[("GH_TOKEN", &token), ("GH_HOST", HOST)],
    )?;
    Ok(UploadOutcome {
        already_present: false,
    })
}

/// Fails with `MissingScope` so the UI can offer to grant it.
pub fn ensure_scope(account: &GhAccount, usage: KeyUsage) -> AppResult<()> {
    let accepted: &[&str] = match usage {
        KeyUsage::Authentication => &["admin:public_key", "write:public_key"],
        KeyUsage::Signing => &["admin:ssh_signing_key", "write:ssh_signing_key"],
    };
    if account
        .scopes
        .iter()
        .any(|scope| accepted.contains(&scope.as_str()))
    {
        return Ok(());
    }
    Err(AppError::MissingScope {
        login: account.login.clone(),
        scope: accepted[0].to_string(),
    })
}

fn token(gh: &Program, login: &str) -> AppResult<String> {
    gh.run(["auth", "token", "--hostname", HOST, "--user", login])
}

fn api<T: for<'de> Deserialize<'de>>(gh: &Program, login: &str, path: &str) -> AppResult<T> {
    let token = token(gh, login)?;
    let body = gh.run_with_env(["api", path], &[("GH_TOKEN", &token), ("GH_HOST", HOST)])?;
    serde_json::from_str(&body)
        .map_err(|error| AppError::command_failed("gh api", error.to_string()))
}

/// Reads the human-readable `gh auth status` report (gh has no JSON form for it).
pub fn parse_status(text: &str) -> Vec<GhAccount> {
    let mut accounts: Vec<GhAccount> = Vec::new();
    for line in text.lines().map(str::trim) {
        if let Some(login) = account_login(line) {
            accounts.push(GhAccount {
                login,
                active: false,
                scopes: Vec::new(),
                healthy: !line.contains("Failed to log in"),
            });
        } else if let Some(account) = accounts.last_mut() {
            if line.starts_with("- Active account: true") {
                account.active = true;
            } else if let Some(scopes) = line.strip_prefix("- Token scopes:") {
                account.scopes = scopes
                    .split(',')
                    .map(|scope| scope.trim().trim_matches('\'').to_string())
                    .filter(|scope| !scope.is_empty() && scope != "none")
                    .collect();
            }
        }
    }
    accounts
}

/// `"✓ Logged in to github.com account octocat (keyring)"` → `octocat`.
fn account_login(line: &str) -> Option<String> {
    let (_, rest) = line.split_once(&format!("to {HOST} account "))?;
    rest.split_whitespace().next().map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATUS: &str = "github.com
  ✓ Logged in to github.com account octo-home (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'

  ✓ Logged in to github.com account octo-work (keyring)
  - Active account: false
  - Git operations protocol: ssh
  - Token: gho_************************************
  - Token scopes: 'admin:public_key', 'admin:ssh_signing_key', 'repo'

  X Failed to log in to github.com account octo-old (keyring)
  - Active account: false
  - The token in keyring is invalid.
";

    #[test]
    fn parses_every_account_with_its_scopes() {
        let accounts = parse_status(STATUS);

        assert_eq!(accounts.len(), 3);
        assert_eq!(accounts[0].login, "octo-home");
        assert!(accounts[0].active);
        assert_eq!(accounts[0].scopes, ["gist", "read:org", "repo", "workflow"]);
        assert!(!accounts[1].active);
        assert!(
            accounts[1]
                .scopes
                .contains(&"admin:ssh_signing_key".to_string())
        );
        assert!(accounts[1].healthy);
        assert!(!accounts[2].healthy);
        assert!(accounts[2].scopes.is_empty());
    }

    #[test]
    fn no_accounts_when_logged_out() {
        assert!(
            parse_status("You are not logged into any GitHub hosts. To log in, run: gh auth login")
                .is_empty()
        );
    }

    /// Read-only smoke test against this machine's real gh:
    /// `cargo test --manifest-path src-tauri/Cargo.toml real_gh -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_gh_lists_accounts_and_reads_users() {
        let home = std::env::var("HOME").expect("HOME is set");
        let tools = crate::programs::Tools::discover(std::path::Path::new(&home));
        let gh = tools.gh.expect("gh is installed");

        let accounts = accounts(&gh).unwrap();
        assert!(!accounts.is_empty(), "log in with gh first");
        for account in &accounts {
            let user = user(&gh, &account.login).unwrap();
            assert_eq!(user.login.to_lowercase(), account.login.to_lowercase());
            assert!(user.noreply_email.ends_with("@users.noreply.github.com"));
            println!(
                "{} active={} scopes={} organizations={}",
                account.login,
                account.active,
                account.scopes.len(),
                user.organizations.len()
            );
        }
    }

    #[test]
    fn key_uploads_need_the_right_scope() {
        let accounts = parse_status(STATUS);

        assert!(matches!(
            ensure_scope(&accounts[0], KeyUsage::Authentication),
            Err(AppError::MissingScope { scope, .. }) if scope == "admin:public_key"
        ));
        assert!(ensure_scope(&accounts[1], KeyUsage::Authentication).is_ok());
        assert!(ensure_scope(&accounts[1], KeyUsage::Signing).is_ok());
    }
}
