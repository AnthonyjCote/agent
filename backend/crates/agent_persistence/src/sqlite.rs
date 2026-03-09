use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::{
    error::PersistenceError,
    health::{HealthCheck, PersistenceHealthReport},
    workspace::{
        ensure_workspace_layout, load_or_create_workspace_metadata, resolve_workspace_root,
        save_workspace_metadata, workspace_paths, WorkspaceMetadata, WorkspacePaths,
    },
};

const CORE_SCHEMA_VERSION: u32 = 1;
const RUNTIME_SCHEMA_VERSION: u32 = 2;
const KNOWLEDGE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy)]
pub enum DatabaseKind {
    Core,
    Runtime,
    KnowledgeCore,
}

impl DatabaseKind {
    fn schema_version(self) -> u32 {
        match self {
            DatabaseKind::Core => CORE_SCHEMA_VERSION,
            DatabaseKind::Runtime => RUNTIME_SCHEMA_VERSION,
            DatabaseKind::KnowledgeCore => KNOWLEDGE_SCHEMA_VERSION,
        }
    }

    fn migration_label(self) -> &'static str {
        match self {
            DatabaseKind::Core => "core",
            DatabaseKind::Runtime => "runtime",
            DatabaseKind::KnowledgeCore => "knowledge_core",
        }
    }

    fn database_path(self, paths: &WorkspacePaths) -> PathBuf {
        match self {
            DatabaseKind::Core => paths.core_db_path.clone(),
            DatabaseKind::Runtime => paths.runtime_db_path.clone(),
            DatabaseKind::KnowledgeCore => paths.kb_core_db_path.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct BootstrapResult {
    pub paths: WorkspacePaths,
    pub metadata: WorkspaceMetadata,
    pub health: PersistenceHealthReport,
}

pub fn bootstrap_workspace() -> Result<BootstrapResult, PersistenceError> {
    let root = resolve_workspace_root()?;
    let paths = workspace_paths(&root);
    ensure_workspace_layout(&paths)?;

    let mut metadata = load_or_create_workspace_metadata(&paths)?;

    migrate_database(DatabaseKind::Core, &paths.core_db_path)?;
    migrate_database(DatabaseKind::Runtime, &paths.runtime_db_path)?;
    migrate_database(DatabaseKind::KnowledgeCore, &paths.kb_core_db_path)?;

    metadata.core_schema_version = CORE_SCHEMA_VERSION;
    metadata.runtime_schema_version = RUNTIME_SCHEMA_VERSION;
    metadata.knowledge_schema_version = KNOWLEDGE_SCHEMA_VERSION;
    save_workspace_metadata(&paths, &metadata)?;

    let health = evaluate_health(&paths, &metadata)?;

    Ok(BootstrapResult {
        paths,
        metadata,
        health,
    })
}

fn migrate_database(kind: DatabaseKind, db_path: &Path) -> Result<(), PersistenceError> {
    let mut connection = Connection::open(db_path).map_err(|error| PersistenceError::Sql {
        context: "Failed to open SQLite database",
        source: error,
        path: Some(db_path.to_path_buf()),
    })?;

    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to enable WAL journal mode",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to enable foreign key pragma",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS __schema_migrations (
                version INTEGER PRIMARY KEY,
                label TEXT NOT NULL,
                applied_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS __bootstrap_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to create internal migration tables",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    ensure_schema_compatibility(kind, &mut connection, db_path)?;

    let target_version = kind.schema_version() as i64;
    let current_version: i64 = connection
        .query_row("SELECT IFNULL(MAX(version), 0) FROM __schema_migrations", [], |row| row.get(0))
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to read schema migration version",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    if current_version >= target_version {
        return Ok(());
    }

    let transaction = connection.transaction().map_err(|error| PersistenceError::Sql {
        context: "Failed to start migration transaction",
        source: error,
        path: Some(db_path.to_path_buf()),
    })?;

    for version in (current_version + 1)..=target_version {
        apply_migration(&transaction, kind, version as u32, db_path)?;
        transaction
            .execute(
                "INSERT INTO __schema_migrations (version, label, applied_at_ms) VALUES (?1, ?2, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))",
                params![version, kind.migration_label()],
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to record schema migration",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?;
    }

    transaction.commit().map_err(|error| PersistenceError::Sql {
        context: "Failed to commit migration transaction",
        source: error,
        path: Some(db_path.to_path_buf()),
    })?;

    Ok(())
}

fn ensure_schema_compatibility(
    kind: DatabaseKind,
    connection: &mut Connection,
    db_path: &Path,
) -> Result<(), PersistenceError> {
    if matches!(kind, DatabaseKind::Runtime) {
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS threads (
                    workspace_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    operator_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT '',
                    message_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, thread_id)
                );
                ",
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to ensure runtime threads schema compatibility",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?;
        return Ok(());
    }

    if !matches!(kind, DatabaseKind::Core) {
        return Ok(());
    }

    let mut statement = connection
        .prepare("PRAGMA table_info(org_chart_state)")
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to inspect org_chart_state schema",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    let mut rows = statement
        .query([])
        .map_err(|error| PersistenceError::Sql {
            context: "Failed to query org_chart_state schema",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;

    let mut has_activity_events_json = false;
    while let Some(row) = rows.next().map_err(|error| PersistenceError::Sql {
        context: "Failed to read org_chart_state schema row",
        source: error,
        path: Some(db_path.to_path_buf()),
    })? {
        let name: String = row.get(1).map_err(|error| PersistenceError::Sql {
            context: "Failed to parse org_chart_state column name",
            source: error,
            path: Some(db_path.to_path_buf()),
        })?;
        if name == "activity_events_json" {
            has_activity_events_json = true;
            break;
        }
    }

    if !has_activity_events_json {
        connection
            .execute(
                "ALTER TABLE org_chart_state ADD COLUMN activity_events_json TEXT NOT NULL DEFAULT '[]'",
                [],
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to backfill org_chart_state.activity_events_json column",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?;
    }

    Ok(())
}

fn apply_migration(
    transaction: &rusqlite::Transaction<'_>,
    kind: DatabaseKind,
    version: u32,
    db_path: &Path,
) -> Result<(), PersistenceError> {
    match (kind, version) {
        (DatabaseKind::Core, 1) => transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS agent_manifests (
                    workspace_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, agent_id)
                );

                CREATE TABLE IF NOT EXISTS org_chart_state (
                    workspace_id TEXT PRIMARY KEY,
                    snapshot_json TEXT NOT NULL,
                    activity_events_json TEXT NOT NULL,
                    command_history_json TEXT NOT NULL,
                    history_cursor INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );
                ",
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to apply core schema migration",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?,
        (DatabaseKind::Runtime, 1) => transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS threads (
                    workspace_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    operator_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT '',
                    message_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, thread_id)
                );

                CREATE TABLE IF NOT EXISTS thread_messages (
                    workspace_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, thread_id, message_id)
                );

                CREATE TABLE IF NOT EXISTS run_events (
                    workspace_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    event_index INTEGER NOT NULL,
                    event_json TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, run_id, event_index)
                );
                ",
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to apply runtime schema migration",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?,
        (DatabaseKind::Runtime, 2) => transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS work_units (
                    workspace_id TEXT NOT NULL,
                    work_unit_id TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    target_operator TEXT NOT NULL,
                    status TEXT NOT NULL,
                    dispatch_mode TEXT NOT NULL DEFAULT 'direct',
                    execution_mode TEXT NOT NULL DEFAULT 'agent_run',
                    run_id TEXT,
                    dedupe_key TEXT NOT NULL,
                    correlation_id TEXT NOT NULL,
                    causation_id TEXT NOT NULL,
                    work_unit_json TEXT NOT NULL,
                    result_json TEXT,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, work_unit_id)
                );

                CREATE INDEX IF NOT EXISTS idx_work_units_workspace_status_updated
                ON work_units (workspace_id, status, updated_at_ms DESC);
                ",
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to apply runtime schema migration (work units)",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?,
        (DatabaseKind::KnowledgeCore, 1) => transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS kb_documents (
                    workspace_id TEXT NOT NULL,
                    doc_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source_uri TEXT,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, doc_id)
                );

                CREATE TABLE IF NOT EXISTS kb_chunks (
                    workspace_id TEXT NOT NULL,
                    chunk_id TEXT NOT NULL,
                    doc_id TEXT NOT NULL,
                    text_content TEXT NOT NULL,
                    updated_at_ms INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, chunk_id)
                );
                ",
            )
            .map_err(|error| PersistenceError::Sql {
                context: "Failed to apply knowledge schema migration",
                source: error,
                path: Some(db_path.to_path_buf()),
            })?,
        _ => {}
    }

    if matches!(kind, DatabaseKind::Core) {
        let _ = transaction.execute(
            "ALTER TABLE org_chart_state ADD COLUMN activity_events_json TEXT NOT NULL DEFAULT '[]'",
            [],
        );
    }

    Ok(())
}

fn evaluate_health(
    paths: &WorkspacePaths,
    metadata: &WorkspaceMetadata,
) -> Result<PersistenceHealthReport, PersistenceError> {
    let mut checks = Vec::new();

    checks.push(HealthCheck {
        key: "workspace_json_exists".to_string(),
        ok: paths.workspace_json_path.exists(),
        detail: paths.workspace_json_path.display().to_string(),
    });

    for kind in [DatabaseKind::Core, DatabaseKind::Runtime, DatabaseKind::KnowledgeCore] {
        let db_path = kind.database_path(paths);
        let can_open = Connection::open(&db_path).is_ok();
        checks.push(HealthCheck {
            key: format!("db_open_{}", kind.migration_label()),
            ok: can_open,
            detail: db_path.display().to_string(),
        });
    }

    checks.push(HealthCheck {
        key: "media_dir_exists".to_string(),
        ok: paths.media_dir.exists(),
        detail: paths.media_dir.display().to_string(),
    });

    Ok(PersistenceHealthReport::from_checks(
        metadata.workspace_id.clone(),
        checks,
    ))
}
