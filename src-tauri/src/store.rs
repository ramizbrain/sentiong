//! Persists `AppState` as JSON. Writes go to a temporary file first and are then
//! renamed into place, so a crash can never leave a half-written state file.

use std::fs;
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::models::AppState;

pub fn load(path: &Path) -> AppResult<AppState> {
    match fs::read_to_string(path) {
        Ok(text) => {
            serde_json::from_str(&text).map_err(|error| AppError::CorruptState(error.to_string()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppState::default()),
        Err(error) => Err(error.into()),
    }
}

pub fn save(path: &Path, state: &AppState) -> AppResult<()> {
    let text =
        serde_json::to_string_pretty(state).map_err(|error| AppError::Task(error.to_string()))?;
    write_atomically(path, &text)
}

/// Writes `contents` to `path` without ever exposing a partial file.
pub fn write_atomically(path: &Path, contents: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("sentiong-tmp");
    fs::write(&temporary, contents)?;
    fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::STATE_VERSION;
    use crate::models::fixtures::plain_profile;

    #[test]
    fn a_missing_file_is_an_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        let state = load(&dir.path().join("state.json")).unwrap();

        assert_eq!(state.version, STATE_VERSION);
        assert!(state.profiles.is_empty());
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/state.json");
        let state = AppState {
            version: STATE_VERSION,
            profiles: vec![plain_profile("work", "me@work.example")],
            active_profile_id: Some("work".into()),
            guard_enabled: true,
            connected: true,
        };

        save(&path, &state).unwrap();

        assert_eq!(load(&path).unwrap(), state);
        assert!(!path.with_extension("sentiong-tmp").exists());
    }

    #[test]
    fn older_files_without_newer_fields_still_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(
            &path,
            r#"{"version":1,"profiles":[],"activeProfileId":null,"guardEnabled":false}"#,
        )
        .unwrap();

        assert!(load(&path).unwrap().connected);
    }

    #[test]
    fn a_damaged_file_is_reported_instead_of_silently_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(&path, "{ not json").unwrap();

        assert!(matches!(load(&path), Err(AppError::CorruptState(_))));
    }
}
