use adapter::{list_seed_agents, server_capabilities, AgentSummary, RuntimeCapabilities};
use agent_persistence::{
    bootstrap_workspace, OrgChartStateRecord, PersistenceHealthReport, PersistenceStateStore,
    ThreadMessageRecord, ThreadRecord,
};
use agent_core::models::{
    channels::{ChannelEnvelope, ChannelKind},
    run::RunRequest,
};
use agent_server::runtime_service::RuntimeService;
use axum::{
    extract::{Path, State},
    routing::post,
    routing::get,
    routing::patch,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    runtime: Arc<RuntimeService>,
    persistence_health: Arc<PersistenceHealthReport>,
    state_store: Arc<PersistenceStateStore>,
    workspace_id: String,
}

async fn health() -> &'static str {
    "ok"
}

async fn persistence_health(
    State(state): State<AppState>,
) -> Json<PersistenceHealthReport> {
    Json(state.persistence_health.as_ref().clone())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStorageMigrationStatusResponse {
    completed: bool,
}

async fn localstorage_migration_status(
    State(state): State<AppState>,
) -> Result<Json<LocalStorageMigrationStatusResponse>, (axum::http::StatusCode, String)> {
    let completed = state
        .state_store
        .localstorage_migration_completed()
        .map_err(internal_error)?;
    Ok(Json(LocalStorageMigrationStatusResponse { completed }))
}

async fn complete_localstorage_migration(
    State(state): State<AppState>,
) -> Result<Json<LocalStorageMigrationStatusResponse>, (axum::http::StatusCode, String)> {
    let completed = state
        .state_store
        .set_localstorage_migration_completed(true)
        .map_err(internal_error)?;
    Ok(Json(LocalStorageMigrationStatusResponse { completed }))
}

async fn capabilities() -> Json<RuntimeCapabilities> {
    Json(server_capabilities())
}

async fn agents() -> Json<Vec<AgentSummary>> {
    Json(list_seed_agents())
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
    #[serde(default)]
    agent_business_unit_name: String,
    #[serde(default)]
    agent_primary_objective: String,
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

async fn start_run(
    State(state): State<AppState>,
    Json(payload): Json<StartRunPayload>,
) -> Json<StartRunResponse> {
    let workspace_id = payload.workspace_id;
    let run_id = payload.run_id;
    let thread_id = payload.thread_id;
    let agent_id = payload.agent_id;
    let agent_name = payload.agent_name;
    let agent_role = payload.agent_role;
    let agent_business_unit_name = payload.agent_business_unit_name;
    let agent_primary_objective = payload.agent_primary_objective;
    let system_directive_short = payload.system_directive_short;
    let sender = payload.sender;
    let recipient = payload.recipient;
    let message = payload.message;
    let allowed_tool_ids = payload.allowed_tool_ids;

    let request = RunRequest {
        workspace_id: workspace_id.clone(),
        run_id: run_id.clone(),
        thread_id: thread_id.clone(),
        agent_id,
        agent_name,
        agent_role,
        system_directive_short,
        input: ChannelEnvelope {
            workspace_id: workspace_id.clone(),
            channel: ChannelKind::ChatUi,
            sender,
            recipient,
            thread_id: thread_id.clone(),
            task_id: None,
            correlation_id: "corr_v1_placeholder".to_string(),
            metadata: serde_json::json!({
                "message": message,
                "agent_business_unit_name": agent_business_unit_name,
                "agent_primary_objective": agent_primary_objective,
                "allowed_tool_ids": allowed_tool_ids
            }),
        },
    };

    state.runtime.reserve_run(&run_id, &workspace_id, &thread_id);
    let runtime_cloned = state.runtime.clone();
    tokio::spawn(async move {
        let _ = runtime_cloned.start_run(request);
    });

    Json(StartRunResponse { run_id })
}

async fn run_events(
    State(state): State<AppState>,
    Path(run_id): Path<String>,
) -> Json<Vec<agent_core::models::run::RunEvent>> {
    Json(state.runtime.list_run_events(&run_id))
}

async fn list_agent_manifests(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, (axum::http::StatusCode, String)> {
    let manifests = state
        .state_store
        .list_agent_manifests(&state.workspace_id)
        .map_err(internal_error)?;
    Ok(Json(manifests))
}

async fn replace_agent_manifests(
    State(state): State<AppState>,
    Json(manifests): Json<Vec<serde_json::Value>>,
) -> Result<axum::http::StatusCode, (axum::http::StatusCode, String)> {
    state
        .state_store
        .replace_agent_manifests(&state.workspace_id, &manifests)
        .map_err(internal_error)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgChartStatePayload {
    snapshot: serde_json::Value,
    activity_events: serde_json::Value,
    command_history: serde_json::Value,
    history_cursor: i64,
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

async fn get_org_chart_state(
    State(state): State<AppState>,
) -> Result<Json<Option<OrgChartStatePayload>>, (axum::http::StatusCode, String)> {
    let value = state
        .state_store
        .get_org_chart_state(&state.workspace_id)
        .map_err(internal_error)?
        .map(OrgChartStatePayload::from);
    Ok(Json(value))
}

async fn save_org_chart_state(
    State(state): State<AppState>,
    Json(payload): Json<OrgChartStatePayload>,
) -> Result<axum::http::StatusCode, (axum::http::StatusCode, String)> {
    state
        .state_store
        .save_org_chart_state(&state.workspace_id, &payload.into())
        .map_err(internal_error)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

fn internal_error(error: agent_persistence::PersistenceError) -> (axum::http::StatusCode, String) {
    (axum::http::StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListThreadsQuery {
    operator_id: Option<String>,
    status: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_threads(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<ListThreadsQuery>,
) -> Result<Json<Vec<ThreadRecord>>, (axum::http::StatusCode, String)> {
    let threads = state
        .state_store
        .list_threads(
            &state.workspace_id,
            query.operator_id.as_deref(),
            query.status.as_deref(),
            query.search.as_deref(),
            query.limit.unwrap_or(100),
            query.offset.unwrap_or(0),
        )
        .map_err(internal_error)?;
    Ok(Json(threads))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateThreadPayload {
    operator_id: String,
    title: Option<String>,
}

async fn create_thread(
    State(state): State<AppState>,
    Json(payload): Json<CreateThreadPayload>,
) -> Result<Json<ThreadRecord>, (axum::http::StatusCode, String)> {
    let thread = state
        .state_store
        .create_thread(
            &state.workspace_id,
            payload.operator_id.trim(),
            payload.title.as_deref(),
        )
        .map_err(internal_error)?;
    Ok(Json(thread))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateThreadPayload {
    title: Option<String>,
    summary: Option<String>,
    status: Option<String>,
}

async fn update_thread(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    Json(payload): Json<UpdateThreadPayload>,
) -> Result<Json<ThreadRecord>, (axum::http::StatusCode, String)> {
    let updated = state
        .state_store
        .update_thread(
            &state.workspace_id,
            &thread_id,
            payload.title.as_deref(),
            payload.summary.as_deref(),
            payload.status.as_deref(),
        )
        .map_err(internal_error)?
        .ok_or((
            axum::http::StatusCode::NOT_FOUND,
            "Thread not found.".to_string(),
        ))?;
    Ok(Json(updated))
}

async fn delete_thread(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
) -> Result<axum::http::StatusCode, (axum::http::StatusCode, String)> {
    state
        .state_store
        .delete_thread(&state.workspace_id, &thread_id)
        .map_err(internal_error)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListThreadMessagesQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_thread_messages(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    axum::extract::Query(query): axum::extract::Query<ListThreadMessagesQuery>,
) -> Result<Json<Vec<ThreadMessageRecord>>, (axum::http::StatusCode, String)> {
    let messages = state
        .state_store
        .list_thread_messages(
            &state.workspace_id,
            &thread_id,
            query.limit.unwrap_or(200),
            query.offset.unwrap_or(0),
        )
        .map_err(internal_error)?;
    Ok(Json(messages))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendThreadMessagePayload {
    role: String,
    content: String,
}

async fn append_thread_message(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    Json(payload): Json<AppendThreadMessagePayload>,
) -> Result<Json<ThreadMessageRecord>, (axum::http::StatusCode, String)> {
    let message = state
        .state_store
        .append_thread_message(
            &state.workspace_id,
            &thread_id,
            payload.role.trim(),
            &payload.content,
        )
        .map_err(internal_error)?;
    Ok(Json(message))
}

#[tokio::main]
async fn main() {
    let _ = agent_server::server_ready();
    let persistence_bootstrap =
        bootstrap_workspace().expect("failed to bootstrap persistence workspace");
    let state_store = Arc::new(PersistenceStateStore::new(
        persistence_bootstrap.paths.clone(),
    ));
    let workspace_id = persistence_bootstrap.metadata.workspace_id.clone();
    let runtime_store = PersistenceStateStore::new(persistence_bootstrap.paths.clone());
    let app_state = AppState {
        runtime: Arc::new(RuntimeService::new(runtime_store, workspace_id.clone())),
        persistence_health: Arc::new(persistence_bootstrap.health),
        workspace_id,
        state_store,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/persistence/health", get(persistence_health))
        .route(
            "/persistence/migration/localstorage",
            get(localstorage_migration_status).post(complete_localstorage_migration),
        )
        .route("/capabilities", get(capabilities))
        .route("/agents", get(agents))
        .route(
            "/state/agent-manifests",
            get(list_agent_manifests).put(replace_agent_manifests),
        )
        .route(
            "/state/org-chart",
            get(get_org_chart_state).put(save_org_chart_state),
        )
        .route("/threads", get(list_threads).post(create_thread))
        .route(
            "/threads/{thread_id}",
            patch(update_thread).delete(delete_thread),
        )
        .route(
            "/threads/{thread_id}/messages",
            get(list_thread_messages).post(append_thread_message),
        )
        .route("/runs", post(start_run))
        .route("/runs/{run_id}/events", get(run_events))
        .with_state(app_state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787")
        .await
        .expect("failed to bind server listener");

    axum::serve(listener, app)
        .await
        .expect("server exited unexpectedly");
}
