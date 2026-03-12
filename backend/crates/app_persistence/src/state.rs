use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

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
pub struct CommsAccountRecord {
    pub account_id: String,
    pub operator_id: String,
    pub channel: String,
    pub address: String,
    pub display_name: String,
    pub status: String,
    pub provider: String,
    pub provider_config_ref: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommsThreadRecord {
    pub thread_id: String,
    pub channel: String,
    pub account_id: String,
    pub title: String,
    pub subject: String,
    pub thread_key: String,
    pub participants: Value,
    pub state: String,
    pub folder: String,
    pub message_count: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub last_message_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommsMessageRecord {
    pub message_id: String,
    pub thread_id: String,
    pub channel: String,
    pub direction: String,
    pub from_account_ref: String,
    pub to_participants: Value,
    pub cc_participants: Value,
    pub bcc_participants: Value,
    pub subject: String,
    pub body_text: String,
    pub reply_to_message_id: Option<String>,
    pub external_message_ref: Option<String>,
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

    pub fn replace_run_events(
        &self,
        workspace_id: &str,
        run_id: &str,
        events_json: &[Value],
    ) -> Result<(), PersistenceError> {
        let mut connection = self.open_runtime_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.runtime_sql_error("Failed to begin replace_run_events transaction", error))?;
        transaction
            .execute(
                "DELETE FROM run_events WHERE workspace_id = ?1 AND run_id = ?2",
                params![workspace_id, run_id],
            )
            .map_err(|error| self.runtime_sql_error("Failed to clear run events", error))?;
        let now = now_ms();
        for (index, event) in events_json.iter().enumerate() {
            let serialized = serde_json::to_string(event).map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize run event",
                source: error,
            })?;
            transaction
                .execute(
                    "
                    INSERT INTO run_events (workspace_id, run_id, event_index, event_json, created_at_ms)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    ",
                    params![workspace_id, run_id, index as i64, serialized, now],
                )
                .map_err(|error| self.runtime_sql_error("Failed to insert run event", error))?;
        }
        transaction
            .commit()
            .map_err(|error| self.runtime_sql_error("Failed to commit replace_run_events transaction", error))?;
        Ok(())
    }

    pub fn list_run_events(
        &self,
        workspace_id: &str,
        run_id: &str,
    ) -> Result<Vec<Value>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT event_json
                FROM run_events
                WHERE workspace_id = ?1 AND run_id = ?2
                ORDER BY event_index ASC
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_run_events query", error))?;
        let rows = statement
            .query_map(params![workspace_id, run_id], |row| row.get::<_, String>(0))
            .map_err(|error| self.runtime_sql_error("Failed to query run events", error))?;

        let mut result = Vec::new();
        for row in rows {
            let value = row.map_err(|error| self.runtime_sql_error("Failed to read run event row", error))?;
            if let Ok(parsed) = serde_json::from_str::<Value>(&value) {
                result.push(parsed);
            }
        }
        Ok(result)
    }

    pub fn list_thread_run_ids(
        &self,
        workspace_id: &str,
        thread_id: &str,
        limit: i64,
    ) -> Result<Vec<String>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT run_id
                FROM run_events
                WHERE workspace_id = ?1
                  AND json_extract(event_json, '$.event') = 'run_started'
                  AND json_extract(event_json, '$.thread_id') = ?2
                GROUP BY run_id
                ORDER BY MAX(created_at_ms) DESC
                LIMIT ?3
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_thread_run_ids query", error))?;
        let rows = statement
            .query_map(params![workspace_id, thread_id, limit.max(1).min(200)], |row| row.get::<_, String>(0))
            .map_err(|error| self.runtime_sql_error("Failed to query thread run ids", error))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(
                row.map_err(|error| self.runtime_sql_error("Failed to read thread run id row", error))?,
            );
        }
        Ok(result)
    }

    pub fn list_comms_accounts(
        &self,
        workspace_id: &str,
        operator_id: Option<&str>,
        channel: Option<&str>,
    ) -> Result<Vec<CommsAccountRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT account_id, operator_id, channel, address, display_name, status, provider, provider_config_ref, created_at_ms, updated_at_ms
                FROM comms_accounts
                WHERE workspace_id = ?1
                  AND (?2 IS NULL OR operator_id = ?2)
                  AND (?3 IS NULL OR channel = ?3)
                ORDER BY updated_at_ms DESC
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_comms_accounts query", error))?;
        let rows = statement
            .query_map(
                params![
                    workspace_id,
                    operator_id.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    channel.map(|value| value.trim()).filter(|value| !value.is_empty())
                ],
                |row| {
                    Ok(CommsAccountRecord {
                        account_id: row.get(0)?,
                        operator_id: row.get(1)?,
                        channel: row.get(2)?,
                        address: row.get(3)?,
                        display_name: row.get(4)?,
                        status: row.get(5)?,
                        provider: row.get(6)?,
                        provider_config_ref: row.get(7)?,
                        created_at_ms: row.get(8)?,
                        updated_at_ms: row.get(9)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query comms accounts", error))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|error| self.runtime_sql_error("Failed to read comms account row", error))?);
        }
        Ok(result)
    }

    pub fn upsert_comms_account(
        &self,
        workspace_id: &str,
        account_id: &str,
        operator_id: &str,
        channel: &str,
        address: &str,
        display_name: &str,
        status: Option<&str>,
    ) -> Result<CommsAccountRecord, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let channel_value = channel.trim().to_lowercase();
        let mut address_value = address.trim().to_string();
        if channel_value == "sms" && address_value.is_empty() {
            address_value = self.generate_unique_sandbox_sms_address(
                workspace_id,
                operator_id.trim(),
                account_id.trim(),
            )?;
        }
        let now = now_ms();
        connection
            .execute(
                "
                INSERT INTO comms_accounts (
                    workspace_id, account_id, operator_id, channel, address, display_name, status, provider, provider_config_ref, created_at_ms, updated_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE(?7, 'active'), 'sandbox', NULL, ?8, ?8)
                ON CONFLICT(workspace_id, account_id) DO UPDATE SET
                    operator_id = excluded.operator_id,
                    channel = excluded.channel,
                    address = excluded.address,
                    display_name = excluded.display_name,
                    status = excluded.status,
                    updated_at_ms = excluded.updated_at_ms
                ",
                params![
                    workspace_id,
                    account_id.trim(),
                    operator_id.trim(),
                    channel_value,
                    address_value,
                    display_name.trim(),
                    status.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to upsert comms account", error))?;
        self.get_comms_account(workspace_id, account_id)?.ok_or_else(|| PersistenceError::Sql {
            context: "Comms account not found immediately after upsert",
            source: rusqlite::Error::QueryReturnedNoRows,
            path: Some(self.paths.runtime_db_path.clone()),
        })
    }

    pub fn get_comms_account(
        &self,
        workspace_id: &str,
        account_id: &str,
    ) -> Result<Option<CommsAccountRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT account_id, operator_id, channel, address, display_name, status, provider, provider_config_ref, created_at_ms, updated_at_ms
                FROM comms_accounts
                WHERE workspace_id = ?1 AND account_id = ?2
                ",
                params![workspace_id, account_id],
                |row| {
                    Ok(CommsAccountRecord {
                        account_id: row.get(0)?,
                        operator_id: row.get(1)?,
                        channel: row.get(2)?,
                        address: row.get(3)?,
                        display_name: row.get(4)?,
                        status: row.get(5)?,
                        provider: row.get(6)?,
                        provider_config_ref: row.get(7)?,
                        created_at_ms: row.get(8)?,
                        updated_at_ms: row.get(9)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load comms account", error))
    }

    pub fn get_comms_account_by_address(
        &self,
        workspace_id: &str,
        channel: &str,
        address: &str,
    ) -> Result<Option<CommsAccountRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT account_id, operator_id, channel, address, display_name, status, provider, provider_config_ref, created_at_ms, updated_at_ms
                FROM comms_accounts
                WHERE workspace_id = ?1
                  AND channel = ?2
                  AND lower(address) = lower(?3)
                ORDER BY updated_at_ms DESC
                LIMIT 1
                ",
                params![workspace_id, channel.trim(), address.trim()],
                |row| {
                    Ok(CommsAccountRecord {
                        account_id: row.get(0)?,
                        operator_id: row.get(1)?,
                        channel: row.get(2)?,
                        address: row.get(3)?,
                        display_name: row.get(4)?,
                        status: row.get(5)?,
                        provider: row.get(6)?,
                        provider_config_ref: row.get(7)?,
                        created_at_ms: row.get(8)?,
                        updated_at_ms: row.get(9)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load comms account by address", error))
    }

    pub fn list_comms_threads(
        &self,
        workspace_id: &str,
        channel: Option<&str>,
        account_id: Option<&str>,
        folder: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CommsThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT thread_id, channel, account_id, title, subject, thread_key, participants_json, state, folder, message_count, created_at_ms, updated_at_ms, last_message_at_ms
                FROM comms_threads
                WHERE workspace_id = ?1
                  AND (?2 IS NULL OR channel = ?2)
                  AND (?3 IS NULL OR account_id = ?3)
                  AND (?4 IS NULL OR folder = ?4)
                  AND (?5 IS NULL OR title LIKE ?5 OR subject LIKE ?5)
                ORDER BY updated_at_ms DESC
                LIMIT ?6 OFFSET ?7
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_comms_threads query", error))?;
        let search_like = search
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(|value| format!("%{}%", value));
        let rows = statement
            .query_map(
                params![
                    workspace_id,
                    channel.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    account_id.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    folder.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    search_like,
                    limit.max(1).min(500),
                    offset.max(0)
                ],
                |row| {
                    let participants_json: String = row.get(6)?;
                    Ok(CommsThreadRecord {
                        thread_id: row.get(0)?,
                        channel: row.get(1)?,
                        account_id: row.get(2)?,
                        title: row.get(3)?,
                        subject: row.get(4)?,
                        thread_key: row.get(5)?,
                        participants: serde_json::from_str(&participants_json)
                            .unwrap_or_else(|_| serde_json::json!([])),
                        state: row.get(7)?,
                        folder: row.get(8)?,
                        message_count: row.get(9)?,
                        created_at_ms: row.get(10)?,
                        updated_at_ms: row.get(11)?,
                        last_message_at_ms: row.get(12)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query comms threads", error))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|error| self.runtime_sql_error("Failed to read comms thread row", error))?);
        }
        Ok(result)
    }

    pub fn create_comms_thread(
        &self,
        workspace_id: &str,
        channel: &str,
        account_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        participants: Option<&Value>,
        folder: Option<&str>,
    ) -> Result<CommsThreadRecord, PersistenceError> {
        let channel_value = channel.trim().to_lowercase();
        let account_id_value = account_id.trim().to_string();
        if channel_value == "sms" {
            if let Some(peer_number) = extract_sms_peer_number(participants) {
                let thread_key = format!("sms:peer:{}", peer_number.trim().to_lowercase());
                if let Some(existing) = self.find_latest_comms_thread_by_thread_key(
                    workspace_id,
                    "sms",
                    &account_id_value,
                    &thread_key,
                )? {
                    let desired_title = title
                        .map(|value| value.trim())
                        .filter(|value| !value.is_empty());
                    if let Some(desired_title) = desired_title {
                        if existing.title != desired_title {
                            if let Some(updated) = self.update_comms_thread(
                                workspace_id,
                                &existing.thread_id,
                                Some(desired_title),
                                None,
                                None,
                                None,
                            )? {
                                return Ok(updated);
                            }
                        }
                    }
                    return Ok(existing);
                }
            }
        }

        let connection = self.open_runtime_db()?;
        let now = now_ms();
        let thread_id = format!("cth_{}", uuid_like_id());
        let title_value = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "New thread".to_string());
        let subject_value = subject
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        let thread_key_value = if channel_value == "sms" {
            extract_sms_peer_number(participants)
                .map(|peer_number| format!("sms:peer:{}", peer_number.trim().to_lowercase()))
                .unwrap_or_default()
        } else {
            String::new()
        };
        let participants_json = serde_json::to_string(participants.unwrap_or(&serde_json::json!([])))
            .map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize comms thread participants",
                source: error,
            })?;
        connection
            .execute(
                "
                INSERT INTO comms_threads (
                    workspace_id, thread_id, channel, account_id, title, subject, thread_key, participants_json, state, folder, message_count, created_at_ms, updated_at_ms, last_message_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', COALESCE(?9, 'inbox'), 0, ?10, ?10, ?10)
                ",
                params![
                    workspace_id,
                    thread_id,
                    channel_value,
                    account_id_value,
                    title_value,
                    subject_value,
                    thread_key_value,
                    participants_json,
                    folder.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to create comms thread", error))?;
        self.get_comms_thread(workspace_id, &thread_id)?.ok_or_else(|| PersistenceError::Sql {
            context: "Comms thread not found immediately after create",
            source: rusqlite::Error::QueryReturnedNoRows,
            path: Some(self.paths.runtime_db_path.clone()),
        })
    }

    pub fn get_comms_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<Option<CommsThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT thread_id, channel, account_id, title, subject, thread_key, participants_json, state, folder, message_count, created_at_ms, updated_at_ms, last_message_at_ms
                FROM comms_threads
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![workspace_id, thread_id],
                |row| {
                    let participants_json: String = row.get(6)?;
                    Ok(CommsThreadRecord {
                        thread_id: row.get(0)?,
                        channel: row.get(1)?,
                        account_id: row.get(2)?,
                        title: row.get(3)?,
                        subject: row.get(4)?,
                        thread_key: row.get(5)?,
                        participants: serde_json::from_str(&participants_json)
                            .unwrap_or_else(|_| serde_json::json!([])),
                        state: row.get(7)?,
                        folder: row.get(8)?,
                        message_count: row.get(9)?,
                        created_at_ms: row.get(10)?,
                        updated_at_ms: row.get(11)?,
                        last_message_at_ms: row.get(12)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load comms thread", error))
    }

    pub fn find_latest_comms_thread_by_subject(
        &self,
        workspace_id: &str,
        channel: &str,
        account_id: &str,
        folder: &str,
        subject: &str,
    ) -> Result<Option<CommsThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT thread_id, channel, account_id, title, subject, thread_key, participants_json, state, folder, message_count, created_at_ms, updated_at_ms, last_message_at_ms
                FROM comms_threads
                WHERE workspace_id = ?1
                  AND channel = ?2
                  AND account_id = ?3
                  AND folder = ?4
                  AND subject = ?5
                ORDER BY updated_at_ms DESC
                LIMIT 1
                ",
                params![
                    workspace_id,
                    channel.trim(),
                    account_id.trim(),
                    folder.trim(),
                    subject.trim()
                ],
                |row| {
                    let participants_json: String = row.get(6)?;
                    Ok(CommsThreadRecord {
                        thread_id: row.get(0)?,
                        channel: row.get(1)?,
                        account_id: row.get(2)?,
                        title: row.get(3)?,
                        subject: row.get(4)?,
                        thread_key: row.get(5)?,
                        participants: serde_json::from_str(&participants_json)
                            .unwrap_or_else(|_| serde_json::json!([])),
                        state: row.get(7)?,
                        folder: row.get(8)?,
                        message_count: row.get(9)?,
                        created_at_ms: row.get(10)?,
                        updated_at_ms: row.get(11)?,
                        last_message_at_ms: row.get(12)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to find latest comms thread by subject", error))
    }

    pub fn find_latest_comms_thread_by_thread_key(
        &self,
        workspace_id: &str,
        channel: &str,
        account_id: &str,
        thread_key: &str,
    ) -> Result<Option<CommsThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT thread_id, channel, account_id, title, subject, thread_key, participants_json, state, folder, message_count, created_at_ms, updated_at_ms, last_message_at_ms
                FROM comms_threads
                WHERE workspace_id = ?1
                  AND channel = ?2
                  AND account_id = ?3
                  AND thread_key = ?4
                ORDER BY updated_at_ms DESC
                LIMIT 1
                ",
                params![
                    workspace_id,
                    channel.trim(),
                    account_id.trim(),
                    thread_key.trim()
                ],
                |row| {
                    let participants_json: String = row.get(6)?;
                    Ok(CommsThreadRecord {
                        thread_id: row.get(0)?,
                        channel: row.get(1)?,
                        account_id: row.get(2)?,
                        title: row.get(3)?,
                        subject: row.get(4)?,
                        thread_key: row.get(5)?,
                        participants: serde_json::from_str(&participants_json)
                            .unwrap_or_else(|_| serde_json::json!([])),
                        state: row.get(7)?,
                        folder: row.get(8)?,
                        message_count: row.get(9)?,
                        created_at_ms: row.get(10)?,
                        updated_at_ms: row.get(11)?,
                        last_message_at_ms: row.get(12)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to find latest comms thread by thread key", error))
    }

    pub fn update_comms_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        state: Option<&str>,
        folder: Option<&str>,
    ) -> Result<Option<CommsThreadRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let now = now_ms();
        connection
            .execute(
                "
                UPDATE comms_threads
                SET
                    title = COALESCE(?3, title),
                    subject = COALESCE(?4, subject),
                    state = COALESCE(?5, state),
                    folder = COALESCE(?6, folder),
                    updated_at_ms = ?7
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![
                    workspace_id,
                    thread_id,
                    title.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    subject.map(|value| value.trim()),
                    state.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    folder.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to update comms thread", error))?;
        self.get_comms_thread(workspace_id, thread_id)
    }

    pub fn update_comms_thread_thread_key(
        &self,
        workspace_id: &str,
        thread_id: &str,
        thread_key: &str,
    ) -> Result<(), PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .execute(
                "
                UPDATE comms_threads
                SET
                    thread_key = ?3,
                    updated_at_ms = ?4
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![workspace_id, thread_id, thread_key.trim(), now_ms()],
            )
            .map_err(|error| self.runtime_sql_error("Failed to update comms thread key", error))?;
        Ok(())
    }

    pub fn delete_comms_thread(
        &self,
        workspace_id: &str,
        thread_id: &str,
    ) -> Result<(), PersistenceError> {
        let mut connection = self.open_runtime_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.runtime_sql_error("Failed to begin delete_comms_thread transaction", error))?;
        transaction
            .execute(
                "DELETE FROM comms_messages WHERE workspace_id = ?1 AND thread_id = ?2",
                params![workspace_id, thread_id],
            )
            .map_err(|error| self.runtime_sql_error("Failed to delete comms thread messages", error))?;
        transaction
            .execute(
                "DELETE FROM comms_threads WHERE workspace_id = ?1 AND thread_id = ?2",
                params![workspace_id, thread_id],
            )
            .map_err(|error| self.runtime_sql_error("Failed to delete comms thread", error))?;
        transaction
            .commit()
            .map_err(|error| self.runtime_sql_error("Failed to commit delete_comms_thread transaction", error))?;
        Ok(())
    }

    pub fn list_comms_messages(
        &self,
        workspace_id: &str,
        thread_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CommsMessageRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut statement = connection
            .prepare(
                "
                SELECT message_id, thread_id, channel, direction, from_account_ref, to_participants_json, cc_participants_json, bcc_participants_json, subject, body_text, reply_to_message_id, external_message_ref, created_at_ms
                FROM comms_messages
                WHERE workspace_id = ?1 AND thread_id = ?2
                ORDER BY created_at_ms ASC
                LIMIT ?3 OFFSET ?4
                ",
            )
            .map_err(|error| self.runtime_sql_error("Failed to prepare list_comms_messages query", error))?;
        let rows = statement
            .query_map(
                params![workspace_id, thread_id, limit.max(1).min(1000), offset.max(0)],
                |row| {
                    let to_json: String = row.get(5)?;
                    let cc_json: String = row.get(6)?;
                    let bcc_json: String = row.get(7)?;
                    Ok(CommsMessageRecord {
                        message_id: row.get(0)?,
                        thread_id: row.get(1)?,
                        channel: row.get(2)?,
                        direction: row.get(3)?,
                        from_account_ref: row.get(4)?,
                        to_participants: serde_json::from_str(&to_json).unwrap_or_else(|_| serde_json::json!([])),
                        cc_participants: serde_json::from_str(&cc_json).unwrap_or_else(|_| serde_json::json!([])),
                        bcc_participants: serde_json::from_str(&bcc_json).unwrap_or_else(|_| serde_json::json!([])),
                        subject: row.get(8)?,
                        body_text: row.get(9)?,
                        reply_to_message_id: row.get(10)?,
                        external_message_ref: row.get(11)?,
                        created_at_ms: row.get(12)?,
                    })
                },
            )
            .map_err(|error| self.runtime_sql_error("Failed to query comms messages", error))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|error| self.runtime_sql_error("Failed to read comms message row", error))?);
        }
        Ok(result)
    }

    pub fn get_comms_message(
        &self,
        workspace_id: &str,
        thread_id: &str,
        message_id: &str,
    ) -> Result<Option<CommsMessageRecord>, PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .query_row(
                "
                SELECT message_id, thread_id, channel, direction, from_account_ref, to_participants_json, cc_participants_json, bcc_participants_json, subject, body_text, reply_to_message_id, external_message_ref, created_at_ms
                FROM comms_messages
                WHERE workspace_id = ?1 AND thread_id = ?2 AND message_id = ?3
                ",
                params![workspace_id, thread_id, message_id],
                |row| {
                    let to_json: String = row.get(5)?;
                    let cc_json: String = row.get(6)?;
                    let bcc_json: String = row.get(7)?;
                    Ok(CommsMessageRecord {
                        message_id: row.get(0)?,
                        thread_id: row.get(1)?,
                        channel: row.get(2)?,
                        direction: row.get(3)?,
                        from_account_ref: row.get(4)?,
                        to_participants: serde_json::from_str(&to_json).unwrap_or_else(|_| serde_json::json!([])),
                        cc_participants: serde_json::from_str(&cc_json).unwrap_or_else(|_| serde_json::json!([])),
                        bcc_participants: serde_json::from_str(&bcc_json).unwrap_or_else(|_| serde_json::json!([])),
                        subject: row.get(8)?,
                        body_text: row.get(9)?,
                        reply_to_message_id: row.get(10)?,
                        external_message_ref: row.get(11)?,
                        created_at_ms: row.get(12)?,
                    })
                },
            )
            .optional()
            .map_err(|error| self.runtime_sql_error("Failed to load comms message", error))
    }

    pub fn append_comms_message(
        &self,
        workspace_id: &str,
        thread_id: &str,
        direction: &str,
        from_account_ref: &str,
        to_participants: Option<&Value>,
        cc_participants: Option<&Value>,
        bcc_participants: Option<&Value>,
        subject: Option<&str>,
        body_text: &str,
        reply_to_message_id: Option<&str>,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let mut connection = self.open_runtime_db()?;
        let transaction = connection
            .transaction()
            .map_err(|error| self.runtime_sql_error("Failed to begin append_comms_message transaction", error))?;
        let now = now_ms();
        let message_id = format!("cmsg_{}", uuid_like_id());
        let to_json = serde_json::to_string(to_participants.unwrap_or(&serde_json::json!([])))
            .map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize comms message recipients",
                source: error,
            })?;
        let cc_json = serde_json::to_string(cc_participants.unwrap_or(&serde_json::json!([])))
            .map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize comms message cc recipients",
                source: error,
            })?;
        let bcc_json = serde_json::to_string(bcc_participants.unwrap_or(&serde_json::json!([])))
            .map_err(|error| PersistenceError::JsonSerialize {
                context: "Failed to serialize comms message bcc recipients",
                source: error,
            })?;
        transaction
            .execute(
                "
                INSERT INTO comms_messages (
                    workspace_id, thread_id, message_id, channel, direction, from_account_ref, to_participants_json, cc_participants_json, bcc_participants_json, subject, body_text, reply_to_message_id, external_message_ref, created_at_ms
                )
                SELECT ?1, ?2, ?3, channel, ?4, ?5, ?6, ?7, ?8, COALESCE(?9, ''), ?10, ?11, NULL, ?12
                FROM comms_threads
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![
                    workspace_id,
                    thread_id,
                    message_id,
                    direction.trim(),
                    from_account_ref.trim(),
                    to_json,
                    cc_json,
                    bcc_json,
                    subject.map(|value| value.trim()),
                    body_text,
                    reply_to_message_id.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to insert comms message", error))?;
        transaction
            .execute(
                "
                UPDATE comms_threads
                SET
                    message_count = message_count + 1,
                    updated_at_ms = ?3,
                    last_message_at_ms = ?3
                WHERE workspace_id = ?1 AND thread_id = ?2
                ",
                params![workspace_id, thread_id, now],
            )
            .map_err(|error| self.runtime_sql_error("Failed to update comms thread counters", error))?;
        transaction
            .commit()
            .map_err(|error| self.runtime_sql_error("Failed to commit append_comms_message transaction", error))?;

        self.get_comms_message(workspace_id, thread_id, &message_id)?
            .ok_or_else(|| PersistenceError::Sql {
                context: "Comms message not found immediately after append",
                source: rusqlite::Error::QueryReturnedNoRows,
                path: Some(self.paths.runtime_db_path.clone()),
            })
    }

    pub fn insert_comms_delivery_event(
        &self,
        workspace_id: &str,
        message_id: &str,
        thread_id: &str,
        status: &str,
        error_code: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<(), PersistenceError> {
        let connection = self.open_runtime_db()?;
        connection
            .execute(
                "
                INSERT INTO comms_delivery_events (
                    workspace_id, delivery_event_id, message_id, thread_id, status, error_code, error_message, created_at_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                params![
                    workspace_id,
                    format!("cde_{}", uuid_like_id()),
                    message_id.trim(),
                    thread_id.trim(),
                    status.trim(),
                    error_code.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    error_message.map(|value| value.trim()).filter(|value| !value.is_empty()),
                    now_ms()
                ],
            )
            .map_err(|error| self.runtime_sql_error("Failed to insert comms delivery event", error))?;
        Ok(())
    }

    fn generate_unique_sandbox_sms_address(
        &self,
        workspace_id: &str,
        operator_id: &str,
        account_id: &str,
    ) -> Result<String, PersistenceError> {
        let connection = self.open_runtime_db()?;
        let mut hasher = DefaultHasher::new();
        workspace_id.hash(&mut hasher);
        operator_id.hash(&mut hasher);
        account_id.hash(&mut hasher);
        let seed = hasher.finish();
        for attempt in 0u64..10_000 {
            let candidate = format!("+1555{:07}", ((seed + attempt) % 10_000_000) as u32);
            let taken: Option<String> = connection
                .query_row(
                    "
                    SELECT account_id
                    FROM comms_accounts
                    WHERE workspace_id = ?1
                      AND channel = 'sms'
                      AND address = ?2
                      AND account_id <> ?3
                    LIMIT 1
                    ",
                    params![workspace_id, candidate, account_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| self.runtime_sql_error("Failed to validate sandbox sms address uniqueness", error))?;
            if taken.is_none() {
                return Ok(candidate);
            }
        }
        Err(PersistenceError::Io {
            context: "Failed to generate unique sandbox sms address",
            source: std::io::Error::new(std::io::ErrorKind::Other, "sms address space exhausted"),
            path: Some(self.paths.runtime_db_path.clone()),
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

fn extract_sms_peer_number(participants: Option<&Value>) -> Option<String> {
    let value = participants?;
    let object = value.as_object()?;
    let peer = object.get("peerNumber")?.as_str()?.trim().to_string();
    if peer.is_empty() {
        None
    } else {
        Some(peer)
    }
}

fn uuid_like_id() -> String {
    format!("{:x}", now_ms()).replace('-', "")
}
