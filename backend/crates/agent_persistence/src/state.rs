use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    error::PersistenceError,
    workspace::{
        load_or_create_workspace_metadata, set_localstorage_migration_completed, WorkspacePaths,
    },
};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgChartStateRecord {
    pub snapshot: Value,
    pub activity_events: Value,
    pub command_history: Value,
    pub history_cursor: i64,
}

#[derive(Debug, Clone)]
pub struct PersistenceStateStore {
    paths: WorkspacePaths,
}

impl PersistenceStateStore {
    pub fn new(paths: WorkspacePaths) -> Self {
        Self { paths }
    }

    pub fn workspace_id(&self) -> Result<String, PersistenceError> {
        let metadata = load_or_create_workspace_metadata(&self.paths)?;
        Ok(metadata.workspace_id)
    }

    pub fn localstorage_migration_completed(&self) -> Result<bool, PersistenceError> {
        let metadata = load_or_create_workspace_metadata(&self.paths)?;
        Ok(metadata.migration_localstorage_completed)
    }

    pub fn set_localstorage_migration_completed(&self, completed: bool) -> Result<bool, PersistenceError> {
        let metadata = set_localstorage_migration_completed(&self.paths, completed)?;
        Ok(metadata.migration_localstorage_completed)
    }

    pub fn list_agent_manifests(&self, workspace_id: &str) -> Result<Vec<Value>, PersistenceError> {
        let connection = self.open_core_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT payload_json
                FROM agent_manifests
                WHERE workspace_id = ?1
                ORDER BY updated_at_ms DESC
                ",
            )
            .map_err(|error| self.sql_error("Failed to prepare list_agent_manifests query", error))?;

        let rows = statement
            .query_map(params![workspace_id], |row| row.get::<_, String>(0))
            .map_err(|error| self.sql_error("Failed to query agent manifests", error))?;

        let mut manifests = Vec::new();
        for row in rows {
            let payload = row.map_err(|error| self.sql_error("Failed to read agent manifest row", error))?;
            let parsed = serde_json::from_str::<Value>(&payload).map_err(|error| {
                PersistenceError::JsonParse {
                    context: "Failed to parse persisted agent manifest payload",
                    source: error,
                    path: Some(self.paths.core_db_path.clone()),
                }
            })?;
            manifests.push(parsed);
        }

        Ok(manifests)
    }

    pub fn replace_agent_manifests(
        &self,
        workspace_id: &str,
        manifests: &[Value],
    ) -> Result<(), PersistenceError> {
        let mut connection = self.open_core_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.sql_error("Failed to begin replace_agent_manifests transaction", error))?;

        transaction
            .execute(
                "DELETE FROM agent_manifests WHERE workspace_id = ?1",
                params![workspace_id],
            )
            .map_err(|error| self.sql_error("Failed to clear persisted agent manifests", error))?;

        let timestamp_ms = now_ms();
        for manifest in manifests {
            let agent_id = manifest
                .get("agentId")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if agent_id.is_empty() {
                continue;
            }
            let payload_json = serde_json::to_string(manifest).map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize agent manifest payload",
                source: error,
            })?;
            transaction
                .execute(
                    "
                    INSERT INTO agent_manifests (workspace_id, agent_id, payload_json, updated_at_ms)
                    VALUES (?1, ?2, ?3, ?4)
                    ",
                    params![workspace_id, agent_id, payload_json, timestamp_ms],
                )
                .map_err(|error| self.sql_error("Failed to persist agent manifest", error))?;
        }

        transaction
            .commit()
            .map_err(|error| self.sql_error("Failed to commit agent manifest replacement", error))?;

        Ok(())
    }

    pub fn get_org_chart_state(
        &self,
        workspace_id: &str,
    ) -> Result<Option<OrgChartStateRecord>, PersistenceError> {
        let connection = self.open_core_db()?;
        let row: Option<(String, i64)> = connection
            .query_row(
                "
                SELECT snapshot_json, history_cursor
                FROM org_chart_state
                WHERE workspace_id = ?1
                ",
                params![workspace_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| self.sql_error("Failed to load org chart state", error))?;

        let Some((snapshot_json, history_cursor)) = row else {
            return Ok(None);
        };

        Ok(Some(OrgChartStateRecord {
            snapshot: serde_json::from_str(&snapshot_json).map_err(|error| PersistenceError::JsonParse {
                context: "Failed to parse org chart snapshot JSON",
                source: error,
                path: Some(self.paths.core_db_path.clone()),
            })?,
            activity_events: serde_json::json!([]),
            command_history: serde_json::json!([]),
            history_cursor,
        }))
    }

    pub fn save_org_chart_state(
        &self,
        workspace_id: &str,
        state: &OrgChartStateRecord,
    ) -> Result<(), PersistenceError> {
        let connection = self.open_core_db()?;
        let snapshot_json = serde_json::to_string(&state.snapshot).map_err(|error| {
            PersistenceError::JsonSerialize {
                context: "Failed to serialize org chart snapshot",
                source: error,
            }
        })?;
        let activity_events_json = "[]";
        let command_history_json = "[]";

        connection
            .execute(
                "
                INSERT INTO org_chart_state (
                    workspace_id,
                    snapshot_json,
                    activity_events_json,
                    command_history_json,
                    history_cursor,
                    updated_at_ms
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    snapshot_json = excluded.snapshot_json,
                    activity_events_json = excluded.activity_events_json,
                    command_history_json = excluded.command_history_json,
                    history_cursor = excluded.history_cursor,
                    updated_at_ms = excluded.updated_at_ms
                ",
                params![
                    workspace_id,
                    snapshot_json,
                    activity_events_json,
                    command_history_json,
                    state.history_cursor,
                    now_ms()
                ],
            )
            .map_err(|error| self.sql_error("Failed to upsert org chart state", error))?;

        Ok(())
    }

    fn open_core_db(&self) -> Result<Connection, PersistenceError> {
        Connection::open(&self.paths.core_db_path).map_err(|error| PersistenceError::Sql {
            context: "Failed to open core SQLite database",
            source: error,
            path: Some(self.paths.core_db_path.clone()),
        })
    }

    fn sql_error(&self, context: &'static str, source: rusqlite::Error) -> PersistenceError {
        PersistenceError::Sql {
            context,
            source,
            path: Some(self.paths.core_db_path.clone()),
        }
    }
}
