//! SSH keys in `~/.ssh`: listing the ones that exist and creating new ones.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::models::SshKey;
use crate::programs::Program;

/// Key pairs in `ssh_dir`: a private key with a matching `.pub` next to it.
pub fn list_keys(ssh_dir: &Path) -> AppResult<Vec<SshKey>> {
    let entries = match fs::read_dir(ssh_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };

    let mut keys: Vec<SshKey> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "pub"))
        .filter_map(|public_path| {
            let private_path = public_path.with_extension("");
            private_path.is_file().then_some(())?;
            let public_key = fs::read_to_string(&public_path).ok()?;
            parse_public_key(&private_path, &public_key)
        })
        .collect();
    keys.sort_by(|a, b| a.private_key_path.cmp(&b.private_key_path));
    Ok(keys)
}

/// Reads one key pair given the private key's path.
pub fn read_key(private_key_path: &Path) -> AppResult<SshKey> {
    let public_path = public_key_path(private_key_path);
    let text = fs::read_to_string(&public_path)
        .map_err(|_| AppError::KeyNotFound(public_path.display().to_string()))?;
    parse_public_key(private_key_path, &text).ok_or_else(|| {
        AppError::command_failed(
            "ssh",
            format!("{} is not a public key", public_path.display()),
        )
    })
}

/// Creates an ed25519 key named after the profile, never overwriting an existing file.
/// The key has no passphrase so Git can use it without an agent prompt.
pub fn generate_key(
    ssh_keygen: &Program,
    ssh_dir: &Path,
    profile_slug: &str,
    comment: &str,
) -> AppResult<SshKey> {
    ensure_ssh_dir(ssh_dir)?;
    let private_path = free_key_path(ssh_dir, profile_slug);
    let path_text = private_path.display().to_string();
    ssh_keygen.run([
        "-t", "ed25519", "-C", comment, "-f", &path_text, "-N", "", "-q",
    ])?;
    read_key(&private_path)
}

pub fn public_key_path(private_key_path: &Path) -> PathBuf {
    let mut path = private_key_path.as_os_str().to_owned();
    path.push(".pub");
    PathBuf::from(path)
}

/// `"ssh-ed25519 AAAA... me@example"` → type, body, and optional comment.
fn parse_public_key(private_path: &Path, text: &str) -> Option<SshKey> {
    let line = text.lines().find(|line| !line.trim().is_empty())?.trim();
    let mut parts = line.splitn(3, char::is_whitespace);
    let key_type = parts.next()?.to_string();
    let body = parts.next()?;
    if !key_type.starts_with("ssh-")
        && !key_type.starts_with("ecdsa-")
        && !key_type.starts_with("sk-")
    {
        return None;
    }
    Some(SshKey {
        private_key_path: private_path.display().to_string(),
        public_key: format!("{key_type} {body}"),
        key_type,
        comment: parts
            .next()
            .map(str::trim)
            .filter(|comment| !comment.is_empty())
            .map(String::from),
    })
}

/// `sentiong_work`, or `sentiong_work_2` if that is taken, and so on.
fn free_key_path(ssh_dir: &Path, profile_slug: &str) -> PathBuf {
    let base = format!("sentiong_{profile_slug}");
    (1..)
        .map(|n| {
            if n == 1 {
                base.clone()
            } else {
                format!("{base}_{n}")
            }
        })
        .map(|name| ssh_dir.join(name))
        .find(|path| !path.exists() && !public_key_path(path).exists())
        .expect("an unused file name always exists")
}

fn ensure_ssh_dir(ssh_dir: &Path) -> AppResult<()> {
    if ssh_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(ssh_dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(ssh_dir, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

/// Two public keys are the same key when type and body match; comments differ freely.
pub fn same_key(a: &str, b: &str) -> bool {
    let essence = |key: &str| key.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
    essence(a) == essence(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::programs::Tools;

    #[test]
    fn lists_only_complete_key_pairs() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("id_ed25519"), "private").unwrap();
        fs::write(
            dir.path().join("id_ed25519.pub"),
            "ssh-ed25519 AAAAC3Nz me@laptop\n",
        )
        .unwrap();
        fs::write(dir.path().join("orphan.pub"), "ssh-ed25519 AAAA orphan").unwrap();
        fs::write(
            dir.path().join("known_hosts"),
            "github.com ssh-ed25519 AAAA",
        )
        .unwrap();

        let keys = list_keys(dir.path()).unwrap();

        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].key_type, "ssh-ed25519");
        assert_eq!(keys[0].public_key, "ssh-ed25519 AAAAC3Nz");
        assert_eq!(keys[0].comment.as_deref(), Some("me@laptop"));
        assert!(keys[0].private_key_path.ends_with("id_ed25519"));
    }

    #[test]
    fn a_missing_ssh_folder_has_no_keys() {
        assert!(
            list_keys(Path::new("/definitely/not/here"))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn compares_keys_without_comments() {
        assert!(same_key(
            "ssh-ed25519 AAAA one",
            "ssh-ed25519 AAAA two words"
        ));
        assert!(!same_key("ssh-ed25519 AAAA", "ssh-ed25519 BBBB"));
    }

    #[test]
    fn generates_a_key_without_overwriting_existing_ones() {
        let dir = tempfile::tempdir().unwrap();
        let ssh_dir = dir.path().join(".ssh");
        let tools = Tools::discover(dir.path());
        let Some(ssh_keygen) = tools.ssh_keygen else {
            eprintln!("skipping: ssh-keygen not installed");
            return;
        };

        let first = generate_key(&ssh_keygen, &ssh_dir, "work", "me@work.example").unwrap();
        let second = generate_key(&ssh_keygen, &ssh_dir, "work", "me@work.example").unwrap();

        assert!(first.private_key_path.ends_with("sentiong_work"));
        assert!(second.private_key_path.ends_with("sentiong_work_2"));
        assert_eq!(first.key_type, "ssh-ed25519");
        assert_eq!(first.comment.as_deref(), Some("me@work.example"));
        assert!(!same_key(&first.public_key, &second.public_key));
    }
}
