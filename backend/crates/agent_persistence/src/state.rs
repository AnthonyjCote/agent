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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub thread_id: String,
    pub operator_id: String,
    pub title: String,
    pub summary: String,
    pub message_count: i64,
    pub status: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageRecord {
    pub message_id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkUnitRecord {
    pub work_unit_id: String,
    pub domain: String,
    pub action_type: String,
    pub target_operator: String,
    pub status: String,
    pub dispatch_mode: String,
    pub execution_mode: String,
    pub run_id: Option<String>,
    pub dedupe_key: String,
    pub correlation_id: String,
    pub causation_id: String,
    pub work_unit: Value,
    pub result: Option<Value>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
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

    pub fn list_threads(
        &self,
        workspace_id: &str,
        operator_id: Option<&str>,
        status: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT thread_id, operator_id, title, summary, message_count, status, created_at_ms, updated_at_ms
                FROM threads
                WHERE workspace_id = ?1
                  AND (?2 IS NULL OR operator_id = ?2)
                  AND (?3 IS NULL OR status = ?3)
                  AND (?4 IS NULL OR title LIKE ?4 OR summary LIKE ?4)
                ORDER BY updated_at_ms DESC
                LIMIT ?5 OFFSET ?6
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_threads query", error))?;

        let search_like = search
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(|value| format!("%{}%", value));

        let rows = statement
            .query_map(
                params![
                    workspace_id,
                    operator_id.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    status.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    search_like,
                    limit.max(1).min(200),
                    offset.max(0)
                ],
                |row| {
                    Ok(ThreadRecord {
                        thread_id: row.get(0)?,
                        operator_id: row.get(1)?,
                        title: row.get(2)?,
                        summary: row.get(3)?,
                        message_count: row.get(4)?,
                        status: row.get(5)?,
                        created_at_ms: row.get(6)?,
                        updated_at_ms: row.get(7)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query threads", error))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|error| self.runtime_sql_error("Failed to read thread row", error))?);
        }
        Ok(result)
    }

    pub fn create_thread(
        &self,
        workspace_id: &str,
        operator_id: &str,
        title: Option<&str>,
    ) -> Result<ThreadRecord, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let now = now_ms();
        let thread_id = format!("thread_{}", uuid_like_id());
        let normalized_title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "New conversation".to_string());

        connection
            .execute(
                "
                INSERT INTO threads (
                    workspace_id,
                    thread_id,
                    operator_id,
                    title,
                    summary,
                    message_count,
                    status,
                    created_at_ms,
                    updated_at_ms
                ) VALUES (?1, ?2, ?3, ?4, '', 0, 'active', ?5, ?5)
                ",
                params![workspace_id, thread_id, operator_id, normalized_title, now],
            )
            .map_err(|error| self.runtime_sql_error("Failed to create thread", error))?;

        self.get_thread(workspace_id, &thread_id)?
            .ok_or_else(|| PersistenceError::Sql {
                context: "Thread not found immediately after create",
                source: rusqlite::Error::QueryReturnedNoRows,
                path: Some(self.paths.runtime_db_path.clone()),
            })
    }

    pub fn get_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<Option<ThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT thread_id, operator_id, title, summary, message_count, status, created_at_ms, updated_at_ms
                FROM threads
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![workspace_id, thread_id],
                |row| {
                    Ok(ThreadRecord {
                        thread_id: row.get(0)?,
                        operator_id: row.get(1)?,
                        title: row.get(2)?,
                        summary: row.get(3)?,
                        message_count: row.get(4)?,
                        status: row.get(5)?,
                        created_at_ms: row.get(6)?,
                        updated_at_ms: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load thread", error))
    }

    pub fn update_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
        title: Option<&str>,
        summary: Option<&str>,
        status: Option<&str>,
    ) -> Result<Option<ThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let now = now_ms();
        connection
            .execute(
                "
                UPDATE threads
                SET
                    title = COALESCE(?3, title),
                    summary = COALESCE(?4, summary),
                    status = COALESCE(?5, status),
                    updated_at_ms = ?6
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![
                    workspace_id,
                    thread_id,
                    title.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    summary.map(|value| value.trim()),
                    status.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to update thread", error))?;
        self.get_thread(workspace_id, thread_id)
    }

    pub fn delete_thread(&self, workspace_id: &str, thread_id: &str) -> Result<(), PersistenceError> {
        let mut connection = self.open_runtime_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.runtime_sql_error("Failed to begin delete_thread transaction", error))?;
        transaction
            .execute(
                "DELETE FROM thread_messages WHERE workspace_id = ?1 AND thread_id = ?2",
                params![workspace_id, thread_id],
            )
            .map_err(|error| self.runtime_sql_error("Failed to delete thread messages", error))?;
        transaction
            .execute(
                "DELETE FROM threads WHERE workspace_id = ?1 AND thread_id = ?2",
                params![workspace_id, thread_id],
            )
            .map_err(|error| self.runtime_sql_error("Failed to delete thread row", error))?;
        transaction
            .commit()
            .map_err(|error| self.runtime_sql_error("Failed to commit delete_thread transaction", error))?;
        Ok(())
    }

    pub fn list_thread_messages(
        &self,
        workspace_id: &str,
        thread_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ThreadMessageRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT message_id, thread_id, role, content, created_at_ms
                FROM thread_messages
                WHERE workspace_id = ?1 AND thread_id = ?2
                ORDER BY created_at_ms ASC
                LIMIT ?3 OFFSET ?4
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_thread_messages query", error))?;

        let rows = statement
            .query_map(
                params![workspace_id, thread_id, limit.max(1).min(500), offset.max(0)],
                |row| {
                    Ok(ThreadMessageRecord {
                        message_id: row.get(0)?,
                        thread_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        created_at_ms: row.get(4)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query thread messages", error))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(
                row.map_err(|error| self.runtime_sql_error("Failed to read thread message row", error))?,
            );
        }
        Ok(result)
    }

    pub fn append_thread_message(
        &self,
        workspace_id: &str,
        thread_id: &str,
        role: &str,
        content: &str,
    ) -> Result<ThreadMessageRecord, PersistenceError> {
        let mut connection = self.open_runtime_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.runtime_sql_error("Failed to begin append_thread_message transaction", error))?;

        let now = now_ms();
        let message_id = format!("msg_{}", uuid_like_id());
        let trimmed = content.trim();
        let summary = if trimmed.len() > 240 {
            format!("{}...", &trimmed[..240])
        } else {
            trimmed.to_string()
        };

        transaction
            .execute(
                "
                INSERT INTO thread_messages (
                    workspace_id, thread_id, message_id, role, content, created_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
                params![workspace_id, thread_id, message_id, role, content, now],
            )
            .map_err(|error| self.runtime_sql_error("Failed to insert thread message", error))?;

        transaction
            .execute(
                "
                UPDATE threads
                SET
                    message_count = message_count + 1,
                    summary = ?3,
                    updated_at_ms = ?4
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![workspace_id, thread_id, summary, now],
            )
            .map_err(|error| self.runtime_sql_error("Failed to update thread summary", error))?;

        transaction
            .commit()
            .map_err(|error| self.runtime_sql_error("Failed to commit append_thread_message transaction", error))?;

        Ok(ThreadMessageRecord {
            message_id,
            thread_id: thread_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            created_at_ms: now,
        })
    }

    pub fn list_work_units(
        &self,
        workspace_id: &str,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WorkUnitRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT
                    work_unit_id,
                    domain,
                    action_type,
                    target_operator,
                    status,
                    dispatch_mode,
                    execution_mode,
                    run_id,
                    dedupe_key,
                    correlation_id,
                    causation_id,
                    work_unit_json,
                    result_json,
                    created_at_ms,
                    updated_at_ms
                FROM work_units
                WHERE workspace_id = ?1
                  AND (?2 IS NULL OR status = ?2)
                ORDER BY updated_at_ms DESC
                LIMIT ?3 OFFSET ?4
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_work_units query", error))?;

        let rows = statement
            .query_map(
                params![
                    workspace_id,
                    status.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    limit.max(1).min(500),
                    offset.max(0)
                ],
                |row| {
                    let work_unit_json: String = row.get(11)?;
                    let result_json: Option<String> = row.get(12)?;
                    Ok(WorkUnitRecord {
                        work_unit_id: row.get(0)?,
                        domain: row.get(1)?,
                        action_type: row.get(2)?,
                        target_operator: row.get(3)?,
                        status: row.get(4)?,
                        dispatch_mode: row.get(5)?,
                        execution_mode: row.get(6)?,
                        run_id: row.get(7)?,
                        dedupe_key: row.get(8)?,
                        correlation_id: row.get(9)?,
                        causation_id: row.get(10)?,
                        work_unit: serde_json::from_str(&work_unit_json).unwrap_or_else(|_| serde_json::json!({})),
                        result: result_json
                            .and_then(|value| serde_json::from_str::<Value>(&value).ok()),
                        created_at_ms: row.get(13)?,
                        updated_at_ms: row.get(14)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query work_units", error))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|error| self.runtime_sql_error("Failed to read work_unit row", error))?);
        }
        Ok(result)
    }

    pub fn upsert_work_unit(
        &self,
        workspace_id: &str,
        work_unit_id: &str,
        domain: &str,
        action_type: &str,
        target_operator: &str,
        status: &str,
        dispatch_mode: &str,
        execution_mode: &str,
        run_id: Option<&str>,
        dedupe_key: &str,
        correlation_id: &str,
        causation_id: &str,
        work_unit: &Value,
        result: Option<&Value>,
    ) -> Result<WorkUnitRecord, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let now = now_ms();
        let work_unit_json = serde_json::to_string(work_unit).map_err(|error| PersistenceError::JsonSerialize {
            context: "Failed to serialize work unit payload",
            source: error,
        })?;
        let result_json = result
            .map(|value| serde_json::to_string(value))
            .transpose()
            .map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize work unit result payload",
                source: error,
            })?;

        connection
            .execute(
                "
                INSERT INTO work_units (
                    workspace_id,
                    work_unit_id,
                    domain,
                    action_type,
                    target_operator,
                    status,
                    dispatch_mode,
                    execution_mode,
                    run_id,
                    dedupe_key,
                    correlation_id,
                    causation_id,
                    work_unit_json,
                    result_json,
                    created_at_ms,
                    updated_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
                ON CONFLICT(workspace_id, work_unit_id) DO UPDATE SET
                    status = excluded.status,
                    dispatch_mode = excluded.dispatch_mode,
                    execution_mode = excluded.execution_mode,
                    run_id = excluded.run_id,
                    dedupe_key = excluded.dedupe_key,
                    correlation_id = excluded.correlation_id,
                    causation_id = excluded.causation_id,
                    work_unit_json = excluded.work_unit_json,
                    result_json = excluded.result_json,
                    updated_at_ms = excluded.updated_at_ms
                ",
                params![
                    workspace_id,
                    work_unit_id,
                    domain.trim(),
                    action_type.trim(),
                    target_operator.trim(),
                    status.trim(),
                    dispatch_mode.trim(),
                    execution_mode.trim(),
                    run_id.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    dedupe_key.trim(),
                    correlation_id.trim(),
                    causation_id.trim(),
                    work_unit_json,
                    result_json,
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to upsert work unit", error))?;

        self.get_work_unit(workspace_id, work_unit_id)?.ok_or_else(|| PersistenceError::Sql {
            context: "Work unit not found immediately after upsert",
            source: rusqlite::Error::QueryReturnedNoRows,
            path: Some(self.paths.runtime_db_path.clone()),
        })
    }

    pub fn get_work_unit(
        &self,
        workspace_id: &str,
        work_unit_id: &str,
    ) -> Result<Option<WorkUnitRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let row: Option<(
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            String,
            String,
            Option<String>,
            i64,
            i64,
        )> = connection
            .query_row(
                "
                SELECT
                    work_unit_id,
                    domain,
                    action_type,
                    target_operator,
                    status,
                    dispatch_mode,
                    execution_mode,
                    run_id,
                    dedupe_key,
                    correlation_id,
                    causation_id,
                    work_unit_json,
                    result_json,
                    created_at_ms,
                    updated_at_ms
                FROM work_units
                WHERE workspace_id = ?1 AND work_unit_id = ?2
                ",
                params![workspace_id, work_unit_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                        row.get(9)?,
                        row.get(10)?,
                        row.get(11)?,
                        row.get(12)?,
                        row.get(13)?,
                        row.get(14)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load work unit", error))?;

        let Some((
            work_unit_id,
            domain,
            action_type,
            target_operator,
            status,
            dispatch_mode,
            execution_mode,
            run_id,
            dedupe_key,
            correlation_id,
            causation_id,
            work_unit_json,
            result_json,
            created_at_ms,
            updated_at_ms,
        )) = row
        else {
            return Ok(None);
        };

        Ok(Some(WorkUnitRecord {
            work_unit_id,
            domain,
            action_type,
            target_operator,
            status,
            dispatch_mode,
            execution_mode,
            run_id,
            dedupe_key,
            correlation_id,
            causation_id,
            work_unit: serde_json::from_str(&work_unit_json).unwrap_or_else(|_| serde_json::json!({})),
            result: result_json.and_then(|value| serde_json::from_str::<Value>(&value).ok()),
            created_at_ms,
            updated_at_ms,
        }))
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

    fn open_runtime_db(&self) -> Result<Connection, PersistenceError> {
        Connection::open(&self.paths.runtime_db_path).map_err(|error| PersistenceError::Sql {
            context: "Failed to open runtime SQLite database",
            source: error,
            path: Some(self.paths.runtime_db_path.clone()),
        })
    }

    fn runtime_sql_error(&self, context: &'static str, source: rusqlite::Error) -> PersistenceError {
        PersistenceError::Sql {
            context,
            source,
            path: Some(self.paths.runtime_db_path.clone()),
        }
    }
}

fn uuid_like_id() -> String {
    format!("{:x}", now_ms()).replace('-', "")
}
