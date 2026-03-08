use std::{error::Error, fmt, path::PathBuf};

#[derive(Debug)]
pub enum PersistenceError {
    MissingHomeEnv,
    MissingWindowsAppDataEnv,
    Io {
        context: &'static str,
        source: std::io::Error,
        path: Option<PathBuf>,
    },
    Sql {
        context: &'static str,
        source: rusqlite::Error,
        path: Option<PathBuf>,
    },
    JsonParse {
        context: &'static str,
        source: serde_json::Error,
        path: Option<PathBuf>,
    },
    JsonSerialize {
        context: &'static str,
        source: serde_json::Error,
    },
}

impl fmt::Display for PersistenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PersistenceError::MissingHomeEnv => write!(f, "HOME is not set; cannot resolve workspace path."),
            PersistenceError::MissingWindowsAppDataEnv => {
                write!(f, "APPDATA and USERPROFILE are not set; cannot resolve workspace path.")
            }
            PersistenceError::Io { context, source, path } => {
                if let Some(path) = path {
                    write!(f, "{context} ({}): {source}", path.display())
                } else {
                    write!(f, "{context}: {source}")
                }
            }
            PersistenceError::Sql { context, source, path } => {
                if let Some(path) = path {
                    write!(f, "{context} ({}): {source}", path.display())
                } else {
                    write!(f, "{context}: {source}")
                }
            }
            PersistenceError::JsonParse { context, source, path } => {
                if let Some(path) = path {
                    write!(f, "{context} ({}): {source}", path.display())
                } else {
                    write!(f, "{context}: {source}")
                }
            }
            PersistenceError::JsonSerialize { context, source } => {
                write!(f, "{context}: {source}")
            }
        }
    }
}

impl Error for PersistenceError {}
