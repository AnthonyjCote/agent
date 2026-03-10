use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::error::PersistenceError;

const WORKSPACE_METADATA_VERSION: u32 = 1;

#[derive(Debug, Clone)]
pub struct WorkspacePaths {
    pub root: PathBuf,
    pub workspace_dir: PathBuf,
    pub data_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub operators_dir: PathBuf,
    pub media_dir: PathBuf,
    pub knowledge_dir: PathBuf,
    pub core_db_path: PathBuf,
    pub runtime_db_path: PathBuf,
    pub kb_core_db_path: PathBuf,
    pub workspace_json_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMetadata {
    pub version: u32,
    pub workspace_id: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub migration_localstorage_completed: bool,
    pub core_schema_version: u32,
    pub runtime_schema_version: u32,
    pub knowledge_schema_version: u32,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn generated_workspace_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("ws_{:x}", nanos)
}

pub fn resolve_workspace_root() -> Result<PathBuf, PersistenceError> {
    if let Some(override_dir) = env::var("AGENT_DECK_WORKSPACE_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Ok(PathBuf::from(override_dir));
    }

    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").map_err(|_| PersistenceError::MissingHomeEnv)?;
        return Ok(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("AgentDeck")
                .join("workspaces")
                .join("default"),
        );
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = env::var("APPDATA")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                env::var("USERPROFILE")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| PathBuf::from(value).join("AppData").join("Roaming"))
            })
            .ok_or(PersistenceError::MissingWindowsAppDataEnv)?;
        return Ok(app_data.join("AgentDeck").join("workspaces").join("default"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(data_home) = env::var("XDG_DATA_HOME")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return Ok(
                PathBuf::from(data_home)
                    .join("agent-deck")
                    .join("workspaces")
                    .join("default"),
            );
        }

        let home = env::var("HOME").map_err(|_| PersistenceError::MissingHomeEnv)?;
        Ok(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("agent-deck")
                .join("workspaces")
                .join("default"),
        )
    }
}

pub fn workspace_paths(root: &Path) -> WorkspacePaths {
    let workspace_dir = root.join("workspace");
    let data_dir = root.join("data");
    let knowledge_dir = data_dir.join("knowledge");

    WorkspacePaths {
        root: root.to_path_buf(),
        workspace_dir: workspace_dir.clone(),
        data_dir: data_dir.clone(),
        backups_dir: root.join("backups"),
        operators_dir: root.join("operators"),
        media_dir: root.join("media"),
        knowledge_dir: knowledge_dir.clone(),
        core_db_path: data_dir.join("core.sqlite"),
        runtime_db_path: data_dir.join("runtime.sqlite"),
        kb_core_db_path: knowledge_dir.join("kb-core.sqlite"),
        workspace_json_path: workspace_dir.join("workspace.json"),
    }
}

pub fn ensure_workspace_layout(paths: &WorkspacePaths) -> Result<(), PersistenceError> {
    for directory in [
        &paths.root,
        &paths.workspace_dir,
        &paths.data_dir,
        &paths.backups_dir,
        &paths.operators_dir,
        &paths.media_dir,
        &paths.knowledge_dir,
    ] {
        fs::create_dir_all(directory).map_err(|error| PersistenceError::Io {
            context: "Failed to create workspace directory",
            source: error,
            path: Some(directory.clone()),
        })?;
    }
    Ok(())
}

pub fn load_or_create_workspace_metadata(
    paths: &WorkspacePaths,
) -> Result<WorkspaceMetadata, PersistenceError> {
    if paths.workspace_json_path.exists() {
        let raw = fs::read_to_string(&paths.workspace_json_path).map_err(|error| PersistenceError::Io {
            context: "Failed to read workspace metadata",
            source: error,
            path: Some(paths.workspace_json_path.clone()),
        })?;
        let mut metadata: WorkspaceMetadata =
            serde_json::from_str(&raw).map_err(|error| PersistenceError::JsonParse {
                context: "Failed to parse workspace metadata",
                source: error,
                path: Some(paths.workspace_json_path.clone()),
            })?;
        if metadata.version != WORKSPACE_METADATA_VERSION {
            metadata.version = WORKSPACE_METADATA_VERSION;
            metadata.updated_at_ms = now_ms();
            save_workspace_metadata(paths, &metadata)?;
        }
        return Ok(metadata);
    }

    let now = now_ms();
    let metadata = WorkspaceMetadata {
        version: WORKSPACE_METADATA_VERSION,
        workspace_id: generated_workspace_id(),
        created_at_ms: now,
        updated_at_ms: now,
        migration_localstorage_completed: false,
        core_schema_version: 0,
        runtime_schema_version: 0,
        knowledge_schema_version: 0,
    };

    save_workspace_metadata(paths, &metadata)?;
    Ok(metadata)
}

pub fn save_workspace_metadata(
    paths: &WorkspacePaths,
    metadata: &WorkspaceMetadata,
) -> Result<(), PersistenceError> {
    let mut next = metadata.clone();
    next.updated_at_ms = now_ms();
    let serialized = serde_json::to_string_pretty(&next).map_err(|error| PersistenceError::JsonSerialize {
        context: "Failed to serialize workspace metadata",
        source: error,
    })?;

    fs::write(&paths.workspace_json_path, format!("{serialized}\n")).map_err(|error| {
        PersistenceError::Io {
            context: "Failed to write workspace metadata",
            source: error,
            path: Some(paths.workspace_json_path.clone()),
        }
    })
}

pub fn set_localstorage_migration_completed(
    paths: &WorkspacePaths,
    completed: bool,
) -> Result<WorkspaceMetadata, PersistenceError> {
    let mut metadata = load_or_create_workspace_metadata(paths)?;
    metadata.migration_localstorage_completed = completed;
    save_workspace_metadata(paths, &metadata)?;
    Ok(metadata)
}
