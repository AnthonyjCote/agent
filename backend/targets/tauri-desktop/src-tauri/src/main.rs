#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adapter::{desktop_capabilities, list_seed_agents, AgentSummary, RuntimeCapabilities};
use agent_persistence::{
    bootstrap_workspace, OrgChartStateRecord, PersistenceHealthReport, PersistenceStateStore,
    ThreadMessageRecord, ThreadRecord,
};
use agent_desktop::runtime_service::{RuntimeService, StartRunInput};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
fn get_capabilities() -> RuntimeCapabilities {
    desktop_capabilities()
}

#[tauri::command]
fn list_agents() -> Vec<AgentSummary> {
    list_seed_agents()
}

#[tauri::command]
fn get_persistence_health(health: State<'_, Arc<PersistenceHealthReport>>) -> PersistenceHealthReport {
    health.inner().as_ref().clone()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalStorageMigrationStatusResponse {
    completed: bool,
}

#[tauri::command]
fn get_localstorage_migration_status(
    state_store: State<'_, Arc<PersistenceStateStore>>,
) -> Result<LocalStorageMigrationStatusResponse, String> {
    let completed = state_store
        .localstorage_migration_completed()
        .map_err(|error| error.to_string())?;
    Ok(LocalStorageMigrationStatusResponse { completed })
}

#[tauri::command]
fn complete_localstorage_migration(
    state_store: State<'_, Arc<PersistenceStateStore>>,
) -> Result<LocalStorageMigrationStatusResponse, String> {
    let completed = state_store
        .set_localstorage_migration_completed(true)
        .map_err(|error| error.to_string())?;
    Ok(LocalStorageMigrationStatusResponse { completed })
}

#[tauri::command]
fn list_agent_manifests(
    state_store: State<'_, Arc<PersistenceStateStore>>,
) -> Result<Vec<serde_json::Value>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .list_agent_manifests(&workspace_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn replace_agent_manifests(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    manifests: Vec<serde_json::Value>,
) -> Result<(), String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .replace_agent_manifests(&workspace_id, &manifests)
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgChartStatePayload {
    snapshot: serde_json::Value,
    activity_events: serde_json::Value,
    command_history: serde_json::Value,
    history_cursor: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListThreadsInput {
    operator_id: Option<String>,
    status: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateThreadInput {
    operator_id: String,
    title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateThreadInput {
    title: Option<String>,
    summary: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendThreadMessageInput {
    thread_id: String,
    role: String,
    content: String,
}

impl From<OrgChartStateRecord> for OrgChartStatePayload {
    fn from(value: OrgChartStateRecord) -> Self {
        Self {
            snapshot: value.snapshot,
            activity_events: value.activity_events,
            command_history: value.command_history,
            history_cursor: value.history_cursor,
        }
    }
}

impl From<OrgChartStatePayload> for OrgChartStateRecord {
    fn from(value: OrgChartStatePayload) -> Self {
        Self {
            snapshot: value.snapshot,
            activity_events: value.activity_events,
            command_history: value.command_history,
            history_cursor: value.history_cursor,
        }
    }
}

#[tauri::command]
fn get_org_chart_state(
    state_store: State<'_, Arc<PersistenceStateStore>>,
) -> Result<Option<OrgChartStatePayload>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let value = state_store
        .get_org_chart_state(&workspace_id)
        .map_err(|error| error.to_string())?
        .map(OrgChartStatePayload::from);
    Ok(value)
}

#[tauri::command]
fn save_org_chart_state(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    payload: OrgChartStatePayload,
) -> Result<(), String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .save_org_chart_state(&workspace_id, &payload.into())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_threads(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: Option<ListThreadsInput>,
) -> Result<Vec<ThreadRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let input = input.unwrap_or(ListThreadsInput {
        operator_id: None,
        status: None,
        search: None,
        limit: None,
        offset: None,
    });
    state_store
        .list_threads(
            &workspace_id,
            input.operator_id.as_deref(),
            input.status.as_deref(),
            input.search.as_deref(),
            input.limit.unwrap_or(100),
            input.offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: CreateThreadInput,
) -> Result<ThreadRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .create_thread(&workspace_id, input.operator_id.trim(), input.title.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
    input: UpdateThreadInput,
) -> Result<ThreadRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .update_thread(
            &workspace_id,
            &thread_id,
            input.title.as_deref(),
            input.summary.as_deref(),
            input.status.as_deref(),
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Thread not found.".to_string())
}

#[tauri::command]
fn delete_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
) -> Result<(), String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .delete_thread(&workspace_id, &thread_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_thread_messages(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ThreadMessageRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .list_thread_messages(
            &workspace_id,
            &thread_id,
            limit.unwrap_or(200),
            offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn append_thread_message(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: AppendThreadMessageInput,
) -> Result<ThreadMessageRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .append_thread_message(
            &workspace_id,
            input.thread_id.trim(),
            input.role.trim(),
            &input.content,
        )
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartRunPayload {
    workspace_id: String,
    run_id: String,
    thread_id: String,
    agent_id: String,
    agent_name: String,
    agent_role: String,
    system_directive_short: String,
    sender: String,
    recipient: String,
    message: String,
    #[serde(default)]
    allowed_tool_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartRunResponse {
    run_id: String,
}

#[tauri::command]
fn start_run(runtime: State<'_, Arc<RuntimeService>>, payload: StartRunPayload) -> StartRunResponse {
    let run_id = payload.run_id.clone();
    runtime.reserve_run(&run_id, &payload.workspace_id, &payload.thread_id);

    let runtime_cloned = runtime.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _ = runtime_cloned.start_run(StartRunInput {
            workspace_id: payload.workspace_id,
            run_id: payload.run_id,
            thread_id: payload.thread_id,
            agent_id: payload.agent_id,
            agent_name: payload.agent_name,
            agent_role: payload.agent_role,
            system_directive_short: payload.system_directive_short,
            sender: payload.sender,
            recipient: payload.recipient,
            message: payload.message,
            allowed_tool_ids: payload.allowed_tool_ids,
        });
    });

    StartRunResponse { run_id }
}

#[tauri::command]
fn list_run_events(runtime: State<'_, Arc<RuntimeService>>, run_id: String) -> Vec<serde_json::Value> {
    runtime.list_run_events_json(&run_id)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http(s) URLs are allowed.".to_string());
    }
    open::that(url).map_err(|error| format!("Failed to open URL: {error}"))
}

fn main() {
    let _ = agent_desktop::desktop_ready();
    let persistence_bootstrap =
        bootstrap_workspace().expect("failed to bootstrap persistence workspace");
    let runtime = Arc::new(RuntimeService::new());
    let persistence_health = Arc::new(persistence_bootstrap.health);
    let persistence_state_store = Arc::new(PersistenceStateStore::new(
        persistence_bootstrap.paths.clone(),
    ));

    tauri::Builder::default()
        .manage(runtime)
        .manage(persistence_health)
        .manage(persistence_state_store)
        .invoke_handler(tauri::generate_handler![
            get_capabilities,
            list_agents,
            get_persistence_health,
            get_localstorage_migration_status,
            complete_localstorage_migration,
            list_agent_manifests,
            replace_agent_manifests,
            get_org_chart_state,
            save_org_chart_state,
            list_threads,
            create_thread,
            update_thread,
            delete_thread,
            list_thread_messages,
            append_thread_message,
            start_run,
            list_run_events,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
