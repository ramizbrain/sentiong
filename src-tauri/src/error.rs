use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Every failure that can cross the IPC boundary to the frontend.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0} is not installed or could not be found.")]
    ToolMissing(&'static str),

    #[error("{program} failed: {message}")]
    CommandFailed { program: String, message: String },

    #[error("GitHub account {login} needs the \"{scope}\" permission for this.")]
    MissingScope { login: String, scope: String },

    #[error("Profile not found: {0}")]
    ProfileNotFound(String),

    #[error("{0}")]
    InvalidProfile(String),

    #[error("{0}")]
    GuardConflict(String),

    #[error("Not a Git repository: {0}")]
    NotARepository(String),

    #[error("Folder not found: {0}")]
    FolderNotFound(String),

    #[error("SSH key not found: {0}")]
    KeyNotFound(String),

    #[error("A GitHub login is already running.")]
    LoginInProgress,

    #[error("The saved settings could not be read: {0}")]
    CorruptState(String),

    #[error("File system error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Background task failed: {0}")]
    Task(String),
}

impl AppError {
    pub fn command_failed(program: &str, message: impl Into<String>) -> Self {
        Self::CommandFailed {
            program: program.to_string(),
            message: message.into(),
        }
    }

    /// A stable identifier the frontend can branch on; the message is for people.
    fn code(&self) -> &'static str {
        match self {
            Self::ToolMissing(_) => "toolMissing",
            Self::CommandFailed { .. } => "commandFailed",
            Self::MissingScope { .. } => "missingScope",
            Self::ProfileNotFound(_) => "profileNotFound",
            Self::InvalidProfile(_) => "invalidProfile",
            Self::GuardConflict(_) => "guardConflict",
            Self::NotARepository(_) => "notARepository",
            Self::FolderNotFound(_) => "folderNotFound",
            Self::KeyNotFound(_) => "keyNotFound",
            Self::LoginInProgress => "loginInProgress",
            Self::CorruptState(_) => "corruptState",
            Self::Io(_) => "io",
            Self::Task(_) => "task",
        }
    }
}

/// Serialized as `{ code, message }` so the UI can react to specific failures
/// (for example offering to grant a missing GitHub permission).
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_code_and_message() {
        let error = AppError::MissingScope {
            login: "octocat".into(),
            scope: "admin:public_key".into(),
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "missingScope",
                "message": "GitHub account octocat needs the \"admin:public_key\" permission for this."
            })
        );
    }
}
