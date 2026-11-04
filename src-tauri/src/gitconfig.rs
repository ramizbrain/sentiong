//! Renders the Git config files Sentiong owns. Pure text in, text out: no file system,
//! no processes, so every rule about precedence and quoting is unit-tested here.
//!
//! Layout on disk:
//! - `~/.gitconfig` gets one marked block that includes `sentiong.gitconfig`.
//! - `sentiong.gitconfig` includes the default profile, then the folder rules, then the
//!   owner rules. Git applies later values over earlier ones, so owner rules win.
//! - `profiles/<id>.gitconfig` holds one profile's identity, SSH key, signing, and
//!   HTTPS credentials.

use crate::models::{AppState, Profile};

pub const BLOCK_START: &str = "# >>> sentiong >>>";
pub const BLOCK_END: &str = "# <<< sentiong <<<";

const HOST: &str = "github.com";

/// Facts about the machine that change what gets rendered.
#[derive(Debug, Clone)]
pub struct RenderContext {
    /// Absolute path of `gh`, used by the per-account HTTPS credential helper.
    pub gh_path: Option<String>,
    /// Git 2.36+ understands `includeIf "hasconfig:remote.*.url:..."`.
    pub owner_rules_supported: bool,
    /// macOS and Windows file systems are case-insensitive, so folder rules are too.
    pub case_insensitive_paths: bool,
    /// Set when the guard is on: the global hooks folder.
    pub hooks_path: Option<String>,
}

/// One profile's config file.
pub fn render_profile(profile: &Profile, context: &RenderContext) -> String {
    let details = &profile.details;
    let mut config = ConfigText::new(&format!(
        "Managed by Sentiong (profile \"{}\"). Edit it in the app: manual changes are overwritten.",
        details.label
    ));

    config.section("user");
    config.entry("name", &details.git_name);
    config.entry("email", &details.git_email);
    let signing_key = details
        .ssh_key_path
        .as_deref()
        .filter(|_| details.signing)
        .map(|key| format!("{key}.pub"));
    if let Some(public_key) = &signing_key {
        config.entry("signingKey", public_key);
    }

    config.section("sentiong");
    config.entry("profile", &profile.id);

    if let Some(key) = &details.ssh_key_path {
        config.section("core");
        config.entry(
            "sshCommand",
            &format!("ssh -i {} -o IdentitiesOnly=yes", shell_quote(key)),
        );
    }

    if signing_key.is_some() {
        config.section("gpg");
        config.entry("format", "ssh");
        config.section("commit");
        config.entry("gpgSign", "true");
        config.section("tag");
        config.entry("gpgSign", "true");
    }

    if let (Some(login), Some(gh)) = (&details.github_login, &context.gh_path) {
        config.subsection("credential", &format!("https://{HOST}"));
        // An empty helper clears the ones configured before this file (such as
        // `store`), so HTTPS remotes authenticate as this profile's account.
        config.entry("helper", "");
        config.entry("helper", &credential_helper(gh, login));
    }

    config.finish()
}

/// `sentiong.gitconfig`: which profile applies where, plus the data the guard reads.
pub fn render_main(
    state: &AppState,
    profile_path: impl Fn(&str) -> String,
    context: &RenderContext,
) -> String {
    let mut config = ConfigText::new(
        "Managed by Sentiong. Edit profiles in the app: manual changes are overwritten.\n\
         Later entries win: the default profile, then folder rules, then owner rules.",
    );

    let default_profile = state
        .active_profile_id
        .as_deref()
        .and_then(|id| state.profiles.iter().find(|profile| profile.id == id));
    if let Some(profile) = default_profile {
        config.section("include");
        config.entry("path", &profile_path(&profile.id));
    }

    for profile in &state.profiles {
        for folder in &profile.details.folders {
            config.subsection(
                "includeIf",
                &folder_condition(folder, context.case_insensitive_paths),
            );
            config.entry("path", &profile_path(&profile.id));
        }
    }

    if context.owner_rules_supported {
        for profile in &state.profiles {
            for owner in &profile.details.owners {
                for pattern in owner_remote_patterns(owner) {
                    config.subsection("includeIf", &format!("hasconfig:remote.*.url:{pattern}"));
                    config.entry("path", &profile_path(&profile.id));
                }
            }
        }
    }

    // Read by the guard hook: `git config sentiong.owner.<owner>.email`.
    for profile in &state.profiles {
        for owner in &profile.details.owners {
            config.subsection("sentiong", &format!("owner.{}", owner.to_lowercase()));
            config.entry("profile", &profile.id);
            config.entry("label", &profile.details.label);
            config.entry("email", &profile.details.git_email);
        }
    }

    if let Some(hooks) = &context.hooks_path {
        config.section("core");
        config.entry("hooksPath", hooks);
    }

    config.finish()
}

/// The block added to `~/.gitconfig`.
pub fn managed_block(main_config_path: &str) -> String {
    let mut config = ConfigText::default();
    config.section("include");
    config.entry("path", main_config_path);
    format!(
        "{BLOCK_START}\n# Added by Sentiong. Remove it from the app (Connected to Git > Disconnect) or delete these lines.\n{}{BLOCK_END}\n",
        config.finish()
    )
}

/// Puts the block at the very end of `existing` (so it wins over earlier settings),
/// replacing any previous copy. Everything else is kept byte for byte.
pub fn upsert_managed_block(existing: &str, block: &str) -> String {
    let mut text = remove_managed_block(existing);
    if !text.is_empty() {
        if !text.ends_with('\n') {
            text.push('\n');
        }
        text.push('\n');
    }
    text.push_str(block);
    text
}

/// `existing` without Sentiong's block (and the blank line it was given).
pub fn remove_managed_block(existing: &str) -> String {
    let Some(start) = existing.find(BLOCK_START) else {
        return existing.to_string();
    };
    let end = existing[start..]
        .find(BLOCK_END)
        .map(|offset| start + offset + BLOCK_END.len())
        .unwrap_or(existing.len());
    let end = if existing[end..].starts_with('\n') {
        end + 1
    } else {
        end
    };

    let before = existing[..start]
        .strip_suffix("\n\n")
        .map(|text| format!("{text}\n"));
    let before = before.unwrap_or_else(|| existing[..start].to_string());
    format!("{before}{}", &existing[end..])
}

fn folder_condition(folder: &str, case_insensitive: bool) -> String {
    let keyword = if case_insensitive {
        "gitdir/i"
    } else {
        "gitdir"
    };
    let folder = folder.replace('\\', "/");
    let folder = if folder.ends_with('/') {
        folder
    } else {
        format!("{folder}/")
    };
    format!("{keyword}:{folder}")
}

/// Every common way a GitHub remote URL for `owner` is written. Globs are
/// case-sensitive, so the lowercase spelling is covered too.
pub fn owner_remote_patterns(owner: &str) -> Vec<String> {
    let mut spellings = vec![owner.to_string()];
    let lower = owner.to_lowercase();
    if lower != owner {
        spellings.push(lower);
    }
    spellings
        .iter()
        .flat_map(|name| {
            [
                format!("https://{HOST}/{name}/**"),
                format!("https://*@{HOST}/{name}/**"),
                format!("git@{HOST}:{name}/**"),
                format!("ssh://git@{HOST}/{name}/**"),
            ]
        })
        .collect()
}

/// A Git credential helper that answers with `login`'s token from `gh`, whichever
/// account `gh` currently has active.
fn credential_helper(gh: &str, login: &str) -> String {
    format!(
        "!f() {{ test \"$1\" = get || exit 0; echo username={login}; \
         echo password=$({} auth token --hostname {HOST} --user {login}); }}; f",
        shell_quote(gh)
    )
}

/// Quotes a value for `sh`, which Git uses for `core.sshCommand` and `!` helpers.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Builds Git config text with consistent formatting and quoting.
#[derive(Default)]
struct ConfigText {
    text: String,
}

impl ConfigText {
    fn new(comment: &str) -> Self {
        let text = comment.lines().map(|line| format!("# {line}\n")).collect();
        Self { text }
    }

    fn section(&mut self, name: &str) {
        self.separate();
        self.text.push_str(&format!("[{name}]\n"));
    }

    fn subsection(&mut self, name: &str, subsection: &str) {
        self.separate();
        let escaped = subsection.replace('\\', r"\\").replace('"', "\\\"");
        self.text.push_str(&format!("[{name} \"{escaped}\"]\n"));
    }

    fn entry(&mut self, key: &str, value: &str) {
        self.text
            .push_str(&format!("\t{key} = {}\n", quote_value(value)));
    }

    /// A blank line before every section except the first line of the file.
    fn separate(&mut self) {
        if !self.text.is_empty() && !self.text.ends_with("\n\n") {
            self.text.push('\n');
        }
    }

    fn finish(self) -> String {
        self.text
    }
}

/// Git config values are always written quoted, so `#`, `;` and spaces are safe.
fn quote_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let escaped = value
        .replace('\\', r"\\")
        .replace('"', "\\\"")
        .replace('\n', r"\n")
        .replace('\t', r"\t");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::fixtures::{plain_profile, sample_input};
    use crate::models::{AppState, Profile, STATE_VERSION};

    fn context() -> RenderContext {
        RenderContext {
            gh_path: Some("/opt/homebrew/bin/gh".into()),
            owner_rules_supported: true,
            case_insensitive_paths: false,
            hooks_path: None,
        }
    }

    fn work_profile() -> Profile {
        Profile {
            id: "work".into(),
            details: sample_input(),
        }
    }

    #[test]
    fn a_plain_profile_only_sets_the_identity() {
        let text = render_profile(&plain_profile("home", "me@home.example"), &context());

        assert!(text.contains("[user]\n\tname = \"home name\"\n\temail = \"me@home.example\"\n"));
        assert!(text.contains("[sentiong]\n\tprofile = \"home\"\n"));
        assert!(!text.contains("sshCommand"));
        assert!(!text.contains("gpgSign"));
        assert!(!text.contains("credential"));
    }

    #[test]
    fn a_full_profile_sets_key_signing_and_credentials() {
        let text = render_profile(&work_profile(), &context());

        assert!(text.contains("\tsigningKey = \"/home/octo/.ssh/sentiong_work.pub\"\n"));
        assert!(text.contains(
            "[core]\n\tsshCommand = \"ssh -i '/home/octo/.ssh/sentiong_work' -o IdentitiesOnly=yes\"\n"
        ));
        assert!(text.contains("[gpg]\n\tformat = \"ssh\"\n"));
        assert!(text.contains("[commit]\n\tgpgSign = \"true\"\n"));
        assert!(
            text.contains("[credential \"https://github.com\"]\n\thelper = \n\thelper = \"!f() {")
        );
        assert!(
            text.contains(
                "'/opt/homebrew/bin/gh' auth token --hostname github.com --user octo-work"
            )
        );
    }

    #[test]
    fn signing_without_a_key_is_ignored() {
        let mut profile = work_profile();
        profile.details.ssh_key_path = None;

        let text = render_profile(&profile, &context());

        assert!(!text.contains("signingKey"));
        assert!(!text.contains("gpgSign"));
    }

    #[test]
    fn values_are_quoted_and_escaped() {
        let mut profile = plain_profile("odd", "o@x.example");
        profile.details.git_name = "Name \"with\" # and \\ ; chars".into();

        let text = render_profile(&profile, &context());

        assert!(text.contains(r#"name = "Name \"with\" # and \\ ; chars""#));
    }

    #[test]
    fn main_config_orders_default_then_folders_then_owners() {
        let state = AppState {
            version: STATE_VERSION,
            profiles: vec![plain_profile("home", "me@home.example"), work_profile()],
            active_profile_id: Some("home".into()),
            guard_enabled: false,
            connected: true,
        };

        let text = render_main(&state, |id| format!("/cfg/{id}.gitconfig"), &context());

        let default = text
            .find("[include]\n\tpath = \"/cfg/home.gitconfig\"")
            .unwrap();
        let folder = text
            .find("[includeIf \"gitdir:/home/octo/work/\"]")
            .unwrap();
        let owner = text
            .find("[includeIf \"hasconfig:remote.*.url:git@github.com:octo-org/**\"]")
            .unwrap();
        assert!(default < folder && folder < owner);
        assert!(text.contains("[sentiong \"owner.octo-org\"]\n\tprofile = \"work\"\n\tlabel = \"Work\"\n\temail = \"octo@work.example\"\n"));
        assert!(!text.contains("hooksPath"));
    }

    #[test]
    fn owner_rules_are_left_out_on_old_git_but_guard_data_stays() {
        let state = AppState {
            profiles: vec![work_profile()],
            ..AppState::default()
        };
        let context = RenderContext {
            owner_rules_supported: false,
            ..context()
        };

        let text = render_main(&state, |id| format!("/cfg/{id}.gitconfig"), &context);

        assert!(!text.contains("hasconfig"));
        assert!(text.contains("[sentiong \"owner.octo-org\"]"));
    }

    #[test]
    fn folder_rules_follow_platform_case_rules() {
        assert_eq!(
            folder_condition("/Users/octo/work", true),
            "gitdir/i:/Users/octo/work/"
        );
        assert_eq!(
            folder_condition(r"C:\Users\octo\work\", false),
            "gitdir:C:/Users/octo/work/"
        );
    }

    #[test]
    fn owner_patterns_cover_https_ssh_and_lowercase() {
        let patterns = owner_remote_patterns("Octo-Org");

        assert!(patterns.contains(&"https://github.com/Octo-Org/**".to_string()));
        assert!(patterns.contains(&"https://*@github.com/octo-org/**".to_string()));
        assert!(patterns.contains(&"git@github.com:octo-org/**".to_string()));
        assert!(patterns.contains(&"ssh://git@github.com/Octo-Org/**".to_string()));
        assert_eq!(patterns.len(), 8);
    }

    #[test]
    fn guard_sets_the_hooks_path() {
        let context = RenderContext {
            hooks_path: Some("/home/octo/.config/sentiong/hooks".into()),
            ..context()
        };

        let text = render_main(&AppState::default(), |id| id.to_string(), &context);

        assert!(text.ends_with("[core]\n\thooksPath = \"/home/octo/.config/sentiong/hooks\"\n"));
    }

    #[test]
    fn the_block_is_appended_and_replaced_without_touching_the_rest() {
        let original = "[user]\n\temail = me@example.com\n";
        let block = managed_block("/cfg/sentiong.gitconfig");

        let once = upsert_managed_block(original, &block);
        let twice = upsert_managed_block(&once, &block);

        assert!(once.starts_with(original));
        assert!(once.ends_with(&block));
        assert_eq!(once, twice);
        assert_eq!(remove_managed_block(&once), original);
    }

    #[test]
    fn the_block_moves_to_the_end_when_settings_were_added_after_it() {
        let block = managed_block("/cfg/sentiong.gitconfig");
        let existing = format!("[a]\n\tx = 1\n\n{block}[b]\n\ty = 2\n");

        let updated = upsert_managed_block(&existing, &block);

        assert_eq!(updated, format!("[a]\n\tx = 1\n[b]\n\ty = 2\n\n{block}"));
    }

    #[test]
    fn the_block_is_added_to_an_empty_or_unterminated_file() {
        let block = managed_block("/cfg/sentiong.gitconfig");

        assert_eq!(upsert_managed_block("", &block), block);
        assert_eq!(
            upsert_managed_block("[a]\n\tx = 1", &block),
            format!("[a]\n\tx = 1\n\n{block}")
        );
    }
}
