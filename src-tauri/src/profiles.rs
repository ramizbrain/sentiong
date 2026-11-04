//! Rules for profiles: validation, normalization, and changes to `AppState`.
//! Pure functions; writing the result to disk is `config_writer`'s job.

use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::models::{AppState, Profile, ProfileInput};

/// Accent colors the UI knows. Mirrored in `src/lib/profileColors.ts`.
pub const COLORS: &[&str] = &["iris", "cyan", "amber", "rose", "lime", "sky"];

/// Creates (`id == None`) or replaces a profile. Returns the profile's id.
/// The first profile ever created becomes the default one.
pub fn upsert(state: &mut AppState, id: Option<&str>, input: ProfileInput) -> AppResult<String> {
    let input = normalize(input);
    validate(&input, state, id)?;

    let id = match id {
        Some(id) => {
            let profile = find_mut(state, id)?;
            profile.details = input;
            id.to_string()
        }
        None => {
            let id = unique_slug(&input.label, state);
            state.profiles.push(Profile {
                id: id.clone(),
                details: input,
            });
            id
        }
    };

    if state.active_profile_id.is_none() {
        state.active_profile_id = Some(id.clone());
    }
    Ok(id)
}

/// Deletes a profile. If it was the default, the next remaining profile takes over.
pub fn remove(state: &mut AppState, id: &str) -> AppResult<Profile> {
    let index = state
        .profiles
        .iter()
        .position(|profile| profile.id == id)
        .ok_or_else(|| AppError::ProfileNotFound(id.into()))?;
    let removed = state.profiles.remove(index);
    if state.active_profile_id.as_deref() == Some(id) {
        state.active_profile_id = state.profiles.first().map(|profile| profile.id.clone());
    }
    Ok(removed)
}

pub fn activate(state: &mut AppState, id: &str) -> AppResult<()> {
    find(state, id)?;
    state.active_profile_id = Some(id.to_string());
    Ok(())
}

/// Adds `folder` to a profile's folder rules (and takes it away from any other profile).
pub fn pin_folder(state: &mut AppState, id: &str, folder: &str) -> AppResult<()> {
    find(state, id)?;
    let folder = normalize_folder(folder);
    for profile in &mut state.profiles {
        profile
            .details
            .folders
            .retain(|existing| existing != &folder);
    }
    find_mut(state, id)?.details.folders.push(folder);
    Ok(())
}

pub fn find<'a>(state: &'a AppState, id: &str) -> AppResult<&'a Profile> {
    state
        .profiles
        .iter()
        .find(|profile| profile.id == id)
        .ok_or_else(|| AppError::ProfileNotFound(id.into()))
}

/// The profile a GitHub owner is linked to, if any.
pub fn for_owner<'a>(state: &'a AppState, owner: &str) -> Option<&'a Profile> {
    state.profiles.iter().find(|profile| {
        profile
            .details
            .owners
            .iter()
            .any(|linked| linked.eq_ignore_ascii_case(owner))
    })
}

fn find_mut<'a>(state: &'a mut AppState, id: &str) -> AppResult<&'a mut Profile> {
    state
        .profiles
        .iter_mut()
        .find(|profile| profile.id == id)
        .ok_or_else(|| AppError::ProfileNotFound(id.into()))
}

fn normalize(input: ProfileInput) -> ProfileInput {
    let optional = |value: Option<String>| {
        value
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };

    let mut folders: Vec<String> = Vec::new();
    for folder in input.folders.iter().map(|folder| normalize_folder(folder)) {
        if !folder.is_empty() && !folders.contains(&folder) {
            folders.push(folder);
        }
    }

    let mut owners: Vec<String> = Vec::new();
    for owner in input
        .owners
        .iter()
        .map(|owner| owner.trim().trim_start_matches('@').to_string())
    {
        if !owner.is_empty()
            && !owners
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&owner))
        {
            owners.push(owner);
        }
    }

    ProfileInput {
        label: input.label.trim().to_string(),
        color: input.color.trim().to_string(),
        github_login: optional(input.github_login)
            .map(|login| login.trim_start_matches('@').to_string()),
        git_name: input.git_name.trim().to_string(),
        git_email: input.git_email.trim().to_string(),
        ssh_key_path: optional(input.ssh_key_path),
        signing: input.signing,
        folders,
        owners,
    }
}

fn normalize_folder(folder: &str) -> String {
    let folder = folder.trim();
    let trimmed = folder.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        folder.to_string()
    } else {
        trimmed.to_string()
    }
}

fn validate(input: &ProfileInput, state: &AppState, editing_id: Option<&str>) -> AppResult<()> {
    let invalid = |message: String| Err(AppError::InvalidProfile(message));

    if input.label.is_empty() || input.label.chars().count() > 40 {
        return invalid("Give the profile a name of up to 40 characters.".into());
    }
    if !COLORS.contains(&input.color.as_str()) {
        return invalid(format!("Unknown color: {}", input.color));
    }
    if input.git_name.is_empty() {
        return invalid("Commits need an author name.".into());
    }
    if !is_email(&input.git_email) {
        return invalid(format!("\"{}\" is not an email address.", input.git_email));
    }
    if let Some(login) = &input.github_login
        && !is_github_name(login)
    {
        return invalid(format!("\"{login}\" is not a GitHub username."));
    }
    if input.signing && input.ssh_key_path.is_none() {
        return invalid("Signing commits needs an SSH key.".into());
    }
    if let Some(owner) = input.owners.iter().find(|owner| !is_github_name(owner)) {
        return invalid(format!(
            "\"{owner}\" is not a GitHub user or organization name."
        ));
    }
    if let Some(folder) = input
        .folders
        .iter()
        .find(|folder| !Path::new(folder).is_absolute())
    {
        return invalid(format!("\"{folder}\" is not a full folder path."));
    }

    for other in state
        .profiles
        .iter()
        .filter(|profile| Some(profile.id.as_str()) != editing_id)
    {
        if let Some(folder) = input
            .folders
            .iter()
            .find(|folder| other.details.folders.contains(folder))
        {
            return invalid(format!(
                "{folder} already belongs to the \"{}\" profile.",
                other.details.label
            ));
        }
        if let Some(owner) = input.owners.iter().find(|owner| {
            other
                .details
                .owners
                .iter()
                .any(|o| o.eq_ignore_ascii_case(owner))
        }) {
            return invalid(format!(
                "{owner} is already linked to the \"{}\" profile.",
                other.details.label
            ));
        }
    }
    Ok(())
}

fn is_email(value: &str) -> bool {
    match value.split_once('@') {
        Some((local, domain)) => {
            !local.is_empty()
                && domain.contains('.')
                && !value.chars().any(char::is_whitespace)
                && !domain.contains('@')
        }
        None => false,
    }
}

/// GitHub user and organization names: letters, digits, and single inner hyphens.
fn is_github_name(value: &str) -> bool {
    (1..=39).contains(&value.len())
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        && !value.starts_with('-')
        && !value.ends_with('-')
}

/// `"Work Stuff!"` → `work-stuff`, made unique among existing ids.
fn unique_slug(label: &str, state: &AppState) -> String {
    let mut base = String::new();
    for c in label.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            base.push(c);
        } else if !base.is_empty() && !base.ends_with('-') {
            base.push('-');
        }
    }
    let base = base.trim_end_matches('-').to_string();
    let base = if base.is_empty() {
        "profile".to_string()
    } else {
        base
    };
    let taken = |id: &str| state.profiles.iter().any(|profile| profile.id == id);
    (1..)
        .map(|n| {
            if n == 1 {
                base.clone()
            } else {
                format!("{base}-{n}")
            }
        })
        .find(|id| !taken(id))
        .expect("an unused id always exists")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::fixtures::sample_input;

    fn input(label: &str) -> ProfileInput {
        ProfileInput {
            label: label.into(),
            folders: vec![],
            owners: vec![],
            ..sample_input()
        }
    }

    #[test]
    fn the_first_profile_becomes_the_default() {
        let mut state = AppState::default();

        let first = upsert(&mut state, None, input("Personal")).unwrap();
        let second = upsert(&mut state, None, input("Work")).unwrap();

        assert_eq!(first, "personal");
        assert_eq!(second, "work");
        assert_eq!(state.active_profile_id.as_deref(), Some("personal"));
    }

    #[test]
    fn ids_are_unique_slugs() {
        let mut state = AppState::default();

        upsert(&mut state, None, input("Côté Work!")).unwrap();
        let again = upsert(&mut state, None, input("Côté Work!")).unwrap();
        let symbols = upsert(&mut state, None, input("🚀")).unwrap();

        assert_eq!(state.profiles[0].id, "c-t-work");
        assert_eq!(again, "c-t-work-2");
        assert_eq!(symbols, "profile");
    }

    #[test]
    fn input_is_tidied_before_saving() {
        let mut state = AppState::default();
        let messy = ProfileInput {
            label: "  Work ".into(),
            github_login: Some(" @octo-work ".into()),
            ssh_key_path: Some("   ".into()),
            signing: false,
            folders: vec!["/home/octo/work/".into(), "/home/octo/work".into()],
            owners: vec!["@Octo-Org".into(), "octo-org".into(), " ".into()],
            ..sample_input()
        };

        let id = upsert(&mut state, None, messy).unwrap();
        let saved = &find(&state, &id).unwrap().details;

        assert_eq!(saved.label, "Work");
        assert_eq!(saved.github_login.as_deref(), Some("octo-work"));
        assert_eq!(saved.ssh_key_path, None);
        assert_eq!(saved.folders, ["/home/octo/work"]);
        assert_eq!(saved.owners, ["Octo-Org"]);
    }

    #[test]
    fn rejects_invalid_input_with_a_readable_reason() {
        let cases = [
            (
                ProfileInput {
                    label: "".into(),
                    ..sample_input()
                },
                "name of up to 40",
            ),
            (
                ProfileInput {
                    git_email: "not-an-email".into(),
                    ..sample_input()
                },
                "not an email",
            ),
            (
                ProfileInput {
                    github_login: Some("bad login".into()),
                    ..sample_input()
                },
                "not a GitHub username",
            ),
            (
                ProfileInput {
                    ssh_key_path: None,
                    ..sample_input()
                },
                "needs an SSH key",
            ),
            (
                ProfileInput {
                    owners: vec!["-bad".into()],
                    ..sample_input()
                },
                "not a GitHub user",
            ),
            (
                ProfileInput {
                    folders: vec!["relative/path".into()],
                    ..sample_input()
                },
                "not a full folder path",
            ),
            (
                ProfileInput {
                    color: "plaid".into(),
                    ..sample_input()
                },
                "Unknown color",
            ),
        ];

        for (input, expected) in cases {
            let error = upsert(&mut AppState::default(), None, input)
                .unwrap_err()
                .to_string();
            assert!(
                error.contains(expected),
                "{error:?} should mention {expected:?}"
            );
        }
    }

    #[test]
    fn folders_and_owners_belong_to_one_profile_only() {
        let mut state = AppState::default();
        upsert(&mut state, None, sample_input()).unwrap();

        let same_folder = ProfileInput {
            label: "Other".into(),
            owners: vec![],
            ..sample_input()
        };
        let same_owner = ProfileInput {
            label: "Other".into(),
            folders: vec![],
            owners: vec!["OCTO-ORG".into()],
            ..sample_input()
        };

        assert!(
            upsert(&mut state, None, same_folder)
                .unwrap_err()
                .to_string()
                .contains("already belongs")
        );
        assert!(
            upsert(&mut state, None, same_owner)
                .unwrap_err()
                .to_string()
                .contains("already linked")
        );
        // Editing a profile does not conflict with itself.
        assert!(upsert(&mut state, Some("work"), sample_input()).is_ok());
    }

    #[test]
    fn removing_the_default_hands_over_to_the_next_profile() {
        let mut state = AppState::default();
        upsert(&mut state, None, input("Personal")).unwrap();
        upsert(&mut state, None, input("Work")).unwrap();

        remove(&mut state, "personal").unwrap();
        assert_eq!(state.active_profile_id.as_deref(), Some("work"));

        remove(&mut state, "work").unwrap();
        assert_eq!(state.active_profile_id, None);
        assert!(matches!(
            remove(&mut state, "work"),
            Err(AppError::ProfileNotFound(_))
        ));
    }

    #[test]
    fn pinning_moves_a_folder_between_profiles() {
        let mut state = AppState::default();
        upsert(&mut state, None, input("Personal")).unwrap();
        upsert(&mut state, None, input("Work")).unwrap();

        pin_folder(&mut state, "personal", "/code/app/").unwrap();
        pin_folder(&mut state, "work", "/code/app").unwrap();

        assert!(find(&state, "personal").unwrap().details.folders.is_empty());
        assert_eq!(find(&state, "work").unwrap().details.folders, ["/code/app"]);
    }

    #[test]
    fn owners_match_case_insensitively() {
        let mut state = AppState::default();
        upsert(&mut state, None, sample_input()).unwrap();

        assert_eq!(
            for_owner(&state, "octo-ORG").map(|p| p.id.as_str()),
            Some("work")
        );
        assert!(for_owner(&state, "someone").is_none());
    }
}
