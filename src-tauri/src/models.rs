//! Data shared with the frontend. Every type here is mirrored one-to-one in
//! `src/types/sentiong.ts`; the contract tests at the bottom pin the JSON shape.

use serde::{Deserialize, Serialize};

/// One identity: who you are on GitHub, in commits, and over SSH.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// Stable slug, also used for the profile's gitconfig file name.
    pub id: String,
    #[serde(flatten)]
    pub details: ProfileInput,
}

/// Everything the user edits about a profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub label: String,
    /// A palette key such as `"iris"`; purely visual.
    pub color: String,
    pub github_login: Option<String>,
    pub git_name: String,
    pub git_email: String,
    /// Path of the private key; the public key is the same path plus `.pub`.
    pub ssh_key_path: Option<String>,
    /// Sign commits and tags with the SSH key.
    pub signing: bool,
    /// Repositories inside these folders use this profile.
    pub folders: Vec<String>,
    /// Repositories whose remote belongs to these GitHub users or organizations
    /// use this profile, wherever they are cloned.
    pub owners: Vec<String>,
}

/// What Sentiong persists between runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub version: u32,
    pub profiles: Vec<Profile>,
    /// The profile used wherever no folder or owner rule matches.
    pub active_profile_id: Option<String>,
    pub guard_enabled: bool,
    /// False after the user disconnects Sentiong from Git; nothing is written to
    /// `~/.gitconfig` until they reconnect.
    #[serde(default = "connected_by_default")]
    pub connected: bool,
}

pub const STATE_VERSION: u32 = 1;

fn connected_by_default() -> bool {
    true
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            profiles: Vec::new(),
            active_profile_id: None,
            guard_enabled: false,
            connected: true,
        }
    }
}

/// The state plus everything derived from it that the UI shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub profiles: Vec<Profile>,
    pub active_profile_id: Option<String>,
    pub guard: GuardStatus,
    /// Whether `~/.gitconfig` includes Sentiong right now.
    pub connected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardStatus {
    pub enabled: bool,
    /// Set when another tool already owns the global `core.hooksPath`.
    pub conflict: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub git: ToolStatus,
    pub gh: ToolStatus,
    pub ssh_keygen: ToolStatus,
    /// Owner rules need Git 2.36+ (`includeIf "hasconfig:..."`).
    pub supports_owner_rules: bool,
    pub home_directory: String,
}

/// An account `gh` is logged in to on github.com.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAccount {
    pub login: String,
    pub active: bool,
    pub scopes: Vec<String>,
    /// False when gh reports the stored token as invalid.
    pub healthy: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUser {
    pub login: String,
    pub id: u64,
    pub name: Option<String>,
    pub public_email: Option<String>,
    /// `ID+login@users.noreply.github.com`: commits stay linked without exposing an address.
    pub noreply_email: String,
    pub avatar_url: String,
    pub organizations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub private_key_path: String,
    pub public_key: String,
    pub key_type: String,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyUsage {
    Authentication,
    Signing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadOutcome {
    /// The key was already on the account, so nothing was uploaded.
    pub already_present: bool,
}

/// Progress of a `gh` browser login, streamed over a channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LoginEvent {
    /// Show this code; the user types it at `verification_url`.
    Code {
        code: String,
        verification_url: String,
    },
    Completed {
        login: Option<String>,
    },
    Failed {
        message: String,
    },
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepoStatus {
    /// Uses the profile its owner or folder calls for.
    Ok,
    /// A `user.email` in the repository's own config overrides every rule.
    LocalOverride,
    /// The owner belongs to one profile but another one is in effect.
    WrongProfile,
    /// No profile applies at all.
    Unmanaged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoReport {
    pub path: String,
    pub name: String,
    pub remote_url: Option<String>,
    pub owner: Option<String>,
    pub email: Option<String>,
    pub effective_profile_id: Option<String>,
    pub expected_profile_id: Option<String>,
    pub status: RepoStatus,
    /// The repository sets its own `core.hooksPath` (Husky, Lefthook, ...),
    /// so the global guard does not run there.
    pub guard_bypassed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RepoScanEvent {
    Found { report: RepoReport },
    Finished { total: usize },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RepoFix {
    /// Remove `user.name` / `user.email` from the repository's own config.
    RemoveLocalIdentity,
    /// Add the repository's folder to a profile's folder rules.
    PinToProfile { profile_id: String },
}

/// Sample data for tests across the crate.
#[cfg(test)]
pub(crate) mod fixtures {
    use super::*;

    pub fn sample_input() -> ProfileInput {
        ProfileInput {
            label: "Work".into(),
            color: "iris".into(),
            github_login: Some("octo-work".into()),
            git_name: "Octo Cat".into(),
            git_email: "octo@work.example".into(),
            ssh_key_path: Some("/home/octo/.ssh/sentiong_work".into()),
            signing: true,
            folders: vec!["/home/octo/work".into()],
            owners: vec!["octo-org".into()],
        }
    }

    /// A profile with only an identity: no account, key, or rules.
    pub fn plain_profile(id: &str, email: &str) -> Profile {
        Profile {
            id: id.into(),
            details: ProfileInput {
                label: id.into(),
                color: "iris".into(),
                github_login: None,
                git_name: format!("{id} name"),
                git_email: email.into(),
                ssh_key_path: None,
                signing: false,
                folders: vec![],
                owners: vec![],
            },
        }
    }
}

#[cfg(test)]
mod contract_tests {
    use serde_json::json;

    use super::fixtures::sample_input;
    use super::*;

    #[test]
    fn profile_is_flat_and_camel_case() {
        let profile = Profile {
            id: "work".into(),
            details: sample_input(),
        };

        assert_eq!(
            serde_json::to_value(&profile).unwrap(),
            json!({
                "id": "work",
                "label": "Work",
                "color": "iris",
                "githubLogin": "octo-work",
                "gitName": "Octo Cat",
                "gitEmail": "octo@work.example",
                "sshKeyPath": "/home/octo/.ssh/sentiong_work",
                "signing": true,
                "folders": ["/home/octo/work"],
                "owners": ["octo-org"]
            })
        );
    }

    #[test]
    fn login_events_are_tagged() {
        let event = LoginEvent::Code {
            code: "ABCD-1234".into(),
            verification_url: "https://github.com/login/device".into(),
        };

        assert_eq!(
            serde_json::to_value(event).unwrap(),
            json!({ "type": "code", "code": "ABCD-1234", "verificationUrl": "https://github.com/login/device" })
        );
    }

    #[test]
    fn repo_fixes_deserialize_from_tagged_json() {
        let fix: RepoFix =
            serde_json::from_value(json!({ "type": "pinToProfile", "profileId": "work" })).unwrap();
        assert_eq!(
            fix,
            RepoFix::PinToProfile {
                profile_id: "work".into()
            }
        );

        let fix: RepoFix =
            serde_json::from_value(json!({ "type": "removeLocalIdentity" })).unwrap();
        assert_eq!(fix, RepoFix::RemoveLocalIdentity);
    }

    #[test]
    fn repo_scan_events_are_tagged() {
        assert_eq!(
            serde_json::to_value(RepoScanEvent::Finished { total: 3 }).unwrap(),
            json!({ "type": "finished", "total": 3 })
        );
        assert_eq!(
            serde_json::to_value(RepoStatus::LocalOverride).unwrap(),
            json!("localOverride")
        );
    }
}
