use adapter::{list_seed_agents, server_capabilities, AgentSummary, RuntimeCapabilities};
use app_persistence::{
    bootstrap_workspace, OrgChartStateRecord, PersistenceHealthReport, PersistenceStateStore,
    CommsDeliveryService, SendChatInput, SendEmailInput, SendSmsInput,
    CommsAccountRecord, CommsMessageRecord, CommsThreadRecord, ThreadMessageRecord, ThreadRecord,
    WorkUnitRecord,
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

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone)]
struct AppState {
    runtime: Arc<RuntimeService>,
    persistence_health: Arc<PersistenceHealthReport>,
    state_store: Arc<PersistenceStateStore>,
    comms_delivery: Arc<CommsDeliveryService>,
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
    agent_org_unit_name: String,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugToolExecuteInput {
    tool_id: String,
    #[serde(default)]
    args: serde_json::Value,
    #[serde(default)]
    operator_id: Option<String>,
    #[serde(default)]
    operator_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DebugToolExecuteResponse {
    ok: bool,
    tool_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    normalized_args: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<serde_json::Value>,
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
    let agent_org_unit_name = payload.agent_org_unit_name;
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
                "agent_org_unit_name": agent_org_unit_name,
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

async fn execute_debug_tool(
    State(state): State<AppState>,
    Json(input): Json<DebugToolExecuteInput>,
) -> Json<DebugToolExecuteResponse> {
    match state.runtime.execute_debug_tool(
        &input.tool_id,
        input.args,
        input.operator_id.as_deref(),
        input.operator_name.as_deref(),
    ) {
        Ok((normalized_args, output)) => Json(DebugToolExecuteResponse {
            ok: true,
            tool_id: input.tool_id,
            normalized_args: Some(normalized_args),
            output: Some(output),
            error: None,
        }),
        Err(message) => Json(DebugToolExecuteResponse {
            ok: false,
            tool_id: input.tool_id,
            normalized_args: None,
            output: None,
            error: Some(serde_json::json!({
                "code": "debug_tool_execution_failed",
                "message": message,
                "retryable": false
            })),
        }),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelRunResponse {
    cancelled: bool,
}

async fn cancel_run(
    State(state): State<AppState>,
    Path(run_id): Path<String>,
) -> Json<CancelRunResponse> {
    Json(CancelRunResponse {
        cancelled: state.runtime.cancel_run(&run_id),
    })
}

async fn thread_run_ids(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
) -> Json<Vec<String>> {
    Json(state.runtime.list_thread_run_ids(&thread_id, 50))
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

fn internal_error(error: app_persistence::PersistenceError) -> (axum::http::StatusCode, String) {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCommsAccountsQuery {
    operator_id: Option<String>,
    channel: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertCommsAccountPayload {
    account_id: String,
    operator_id: String,
    channel: String,
    address: String,
    display_name: String,
    status: Option<String>,
}

async fn list_comms_accounts(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<ListCommsAccountsQuery>,
) -> Result<Json<Vec<CommsAccountRecord>>, (axum::http::StatusCode, String)> {
    let rows = state
        .state_store
        .list_comms_accounts(
            &state.workspace_id,
            query.operator_id.as_deref(),
            query.channel.as_deref(),
        )
        .map_err(internal_error)?;
    Ok(Json(rows))
}

async fn upsert_comms_account(
    State(state): State<AppState>,
    Json(payload): Json<UpsertCommsAccountPayload>,
) -> Result<Json<CommsAccountRecord>, (axum::http::StatusCode, String)> {
    let record = state
        .state_store
        .upsert_comms_account(
            &state.workspace_id,
            payload.account_id.trim(),
            payload.operator_id.trim(),
            payload.channel.trim(),
            payload.address.trim(),
            payload.display_name.trim(),
            payload.status.as_deref(),
        )
        .map_err(internal_error)?;
    Ok(Json(record))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCommsThreadsQuery {
    channel: Option<String>,
    account_id: Option<String>,
    folder: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCommsThreadPayload {
    channel: String,
    account_id: String,
    title: Option<String>,
    subject: Option<String>,
    participants: Option<serde_json::Value>,
    folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCommsThreadPayload {
    title: Option<String>,
    subject: Option<String>,
    state: Option<String>,
    folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCommsMessagesQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendCommsMessagePayload {
    direction: Option<String>,
    from_account_ref: String,
    to_participants: Option<serde_json::Value>,
    cc_participants: Option<serde_json::Value>,
    bcc_participants: Option<serde_json::Value>,
    subject: Option<String>,
    body_text: String,
    reply_to_message_id: Option<String>,
}

async fn list_comms_threads(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<ListCommsThreadsQuery>,
) -> Result<Json<Vec<CommsThreadRecord>>, (axum::http::StatusCode, String)> {
    let rows = state
        .state_store
        .list_comms_threads(
            &state.workspace_id,
            query.channel.as_deref(),
            query.account_id.as_deref(),
            query.folder.as_deref(),
            query.search.as_deref(),
            query.limit.unwrap_or(200),
            query.offset.unwrap_or(0),
        )
        .map_err(internal_error)?;
    Ok(Json(rows))
}

async fn create_comms_thread(
    State(state): State<AppState>,
    Json(payload): Json<CreateCommsThreadPayload>,
) -> Result<Json<CommsThreadRecord>, (axum::http::StatusCode, String)> {
    let row = state
        .state_store
        .create_comms_thread(
            &state.workspace_id,
            payload.channel.trim(),
            payload.account_id.trim(),
            payload.title.as_deref(),
            payload.subject.as_deref(),
            payload.participants.as_ref(),
            payload.folder.as_deref(),
        )
        .map_err(internal_error)?;
    Ok(Json(row))
}

async fn update_comms_thread(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    Json(payload): Json<UpdateCommsThreadPayload>,
) -> Result<Json<CommsThreadRecord>, (axum::http::StatusCode, String)> {
    let row = state
        .state_store
        .update_comms_thread(
            &state.workspace_id,
            &thread_id,
            payload.title.as_deref(),
            payload.subject.as_deref(),
            payload.state.as_deref(),
            payload.folder.as_deref(),
        )
        .map_err(internal_error)?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Comms thread not found.".to_string()))?;
    Ok(Json(row))
}

async fn delete_comms_thread(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
) -> Result<axum::http::StatusCode, (axum::http::StatusCode, String)> {
    state
        .state_store
        .delete_comms_thread(&state.workspace_id, &thread_id)
        .map_err(internal_error)?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

async fn list_comms_messages(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    axum::extract::Query(query): axum::extract::Query<ListCommsMessagesQuery>,
) -> Result<Json<Vec<CommsMessageRecord>>, (axum::http::StatusCode, String)> {
    let rows = state
        .state_store
        .list_comms_messages(
            &state.workspace_id,
            &thread_id,
            query.limit.unwrap_or(500),
            query.offset.unwrap_or(0),
        )
        .map_err(internal_error)?;
    Ok(Json(rows))
}

async fn append_comms_message(
    State(state): State<AppState>,
    Path(thread_id): Path<String>,
    Json(payload): Json<AppendCommsMessagePayload>,
) -> Result<Json<CommsMessageRecord>, (axum::http::StatusCode, String)> {
    let direction = payload.direction.as_deref().unwrap_or("outbound");
    let thread = state
        .state_store
        .get_comms_thread(&state.workspace_id, &thread_id)
        .map_err(internal_error)?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Comms thread not found.".to_string()))?;

    let row = if thread.channel == "email" && direction.eq_ignore_ascii_case("outbound") {
        state
            .comms_delivery
            .send_email(
                &state.workspace_id,
                SendEmailInput {
                    thread_id: thread_id.clone(),
                    from_account_ref: payload.from_account_ref.trim().to_string(),
                    to_participants: payload.to_participants.clone(),
                    cc_participants: payload.cc_participants.clone(),
                    bcc_participants: payload.bcc_participants.clone(),
                    subject: payload.subject.clone(),
                    body_text: payload.body_text.clone(),
                    reply_to_message_id: payload.reply_to_message_id.clone(),
                },
            )
            .map_err(internal_error)?
    } else if thread.channel == "sms" && direction.eq_ignore_ascii_case("outbound") {
        state
            .comms_delivery
            .send_sms(
                &state.workspace_id,
                SendSmsInput {
                    thread_id: thread_id.clone(),
                    from_account_ref: payload.from_account_ref.trim().to_string(),
                    to_participants: payload.to_participants.clone(),
                    body_text: payload.body_text.clone(),
                    reply_to_message_id: payload.reply_to_message_id.clone(),
                },
            )
            .map_err(internal_error)?
    } else if thread.channel == "chat" && direction.eq_ignore_ascii_case("outbound") {
        state
            .comms_delivery
            .send_chat(
                &state.workspace_id,
                SendChatInput {
                    thread_id: thread_id.clone(),
                    from_account_ref: payload.from_account_ref.trim().to_string(),
                    to_participants: payload.to_participants.clone(),
                    body_text: payload.body_text.clone(),
                    reply_to_message_id: payload.reply_to_message_id.clone(),
                },
            )
            .map_err(internal_error)?
    } else {
        state
            .state_store
            .append_comms_message(
                &state.workspace_id,
                &thread_id,
                direction,
                payload.from_account_ref.trim(),
                payload.to_participants.as_ref(),
                payload.cc_participants.as_ref(),
                payload.bcc_participants.as_ref(),
                payload.subject.as_deref(),
                &payload.body_text,
                payload.reply_to_message_id.as_deref(),
            )
            .map_err(internal_error)?
    };
    Ok(Json(row))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DispatchWorkUnitInput {
    work_unit: serde_json::Value,
    #[serde(default)]
    options: Option<DispatchWorkUnitOptions>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DispatchWorkUnitOptions {
    execution_mode_override: Option<String>,
    #[serde(default)]
    dry_run: bool,
    #[allow(dead_code)]
    requested_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DispatchWorkUnitResponse {
    work_unit_id: String,
    status: String,
    run_id: Option<String>,
    result_ref: Option<String>,
    error: Option<serde_json::Value>,
    trace: serde_json::Value,
    dispatch_mode: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedRunPayload {
    thread_id: String,
    agent_id: String,
    agent_name: String,
    agent_role: String,
    #[serde(default)]
    agent_business_unit_name: String,
    #[serde(default)]
    agent_org_unit_name: String,
    #[serde(default)]
    agent_primary_objective: String,
    system_directive_short: String,
    sender: String,
    recipient: String,
    message: String,
    #[serde(default)]
    allowed_tool_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListWorkUnitsQuery {
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_work_units(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<ListWorkUnitsQuery>,
) -> Result<Json<Vec<WorkUnitRecord>>, (axum::http::StatusCode, String)> {
    let rows = state
        .state_store
        .list_work_units(
            &state.workspace_id,
            query.status.as_deref(),
            query.limit.unwrap_or(200),
            query.offset.unwrap_or(0),
        )
        .map_err(internal_error)?;
    Ok(Json(rows))
}

async fn dispatch_work_unit(
    State(state): State<AppState>,
    Json(input): Json<DispatchWorkUnitInput>,
) -> Result<Json<DispatchWorkUnitResponse>, (axum::http::StatusCode, String)> {
    let work_unit = input.work_unit;
    let object = work_unit
        .as_object()
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit must be an object".to_string()))?;
    let work_unit_id = object
        .get("id")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("wu_{}", now_ms()));
    let domain = object
        .get("domain")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.domain is required".to_string()))?;
    let action_type = object
        .get("actionType")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.actionType is required".to_string()))?;
    let target_operator = object
        .get("targetOperator")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.targetOperator is required".to_string()))?;
    let dedupe_key = object
        .get("idempotency")
        .and_then(|value| value.get("dedupeKey"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.idempotency.dedupeKey is required".to_string()))?;
    let correlation_id = object
        .get("trace")
        .and_then(|value| value.get("correlationId"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.trace.correlationId is required".to_string()))?;
    let causation_id = object
        .get("trace")
        .and_then(|value| value.get("causationId"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "workUnit.trace.causationId is required".to_string()))?;
    let execution_mode = object
        .get("execution")
        .and_then(|value| value.get("mode"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "agent_run".to_string());
    let dispatch_mode = input
        .options
        .as_ref()
        .and_then(|value| value.execution_mode_override.as_deref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "direct".to_string());
    let dry_run = input.options.as_ref().map(|value| value.dry_run).unwrap_or(false);

    let mut run_id: Option<String> = None;
    let mut status = "queued".to_string();
    if !dry_run && dispatch_mode == "direct" && execution_mode == "agent_run" {
        let maybe_run = object
            .get("input")
            .and_then(|value| value.get("run"));
        if let Some(run_value) = maybe_run {
            if let Ok(run_payload) = serde_json::from_value::<EmbeddedRunPayload>(run_value.clone()) {
                let generated_run_id = format!("run_{}", now_ms());
                run_id = Some(generated_run_id.clone());
                status = "running".to_string();
                state
                    .runtime
                    .reserve_run(&generated_run_id, &state.workspace_id, &run_payload.thread_id);
                let runtime_cloned = state.runtime.clone();
                let request = RunRequest {
                    workspace_id: state.workspace_id.clone(),
                    run_id: generated_run_id.clone(),
                    thread_id: run_payload.thread_id.clone(),
                    agent_id: run_payload.agent_id,
                    agent_name: run_payload.agent_name,
                    agent_role: run_payload.agent_role,
                    system_directive_short: run_payload.system_directive_short,
                    input: ChannelEnvelope {
                        workspace_id: state.workspace_id.clone(),
                        channel: ChannelKind::ChatUi,
                        sender: run_payload.sender,
                        recipient: run_payload.recipient,
                        thread_id: run_payload.thread_id,
                        task_id: Some(work_unit_id.clone()),
                        correlation_id: correlation_id.clone(),
                        metadata: serde_json::json!({
                            "message": run_payload.message,
                            "agent_business_unit_name": run_payload.agent_business_unit_name,
                            "agent_org_unit_name": run_payload.agent_org_unit_name,
                            "agent_primary_objective": run_payload.agent_primary_objective,
                            "allowed_tool_ids": run_payload.allowed_tool_ids
                        }),
                    },
                };
                tokio::spawn(async move {
                    let _ = runtime_cloned.start_run(request);
                });
            }
        }
    }

    state
        .state_store
        .upsert_work_unit(
            &state.workspace_id,
            &work_unit_id,
            &domain,
            &action_type,
            &target_operator,
            &status,
            &dispatch_mode,
            &execution_mode,
            run_id.as_deref(),
            &dedupe_key,
            &correlation_id,
            &causation_id,
            &work_unit,
            None,
        )
        .map_err(internal_error)?;

    Ok(Json(DispatchWorkUnitResponse {
        work_unit_id,
        status,
        run_id,
        result_ref: None,
        error: None,
        trace: serde_json::json!({
            "correlationId": correlation_id,
            "causationId": causation_id
        }),
        dispatch_mode,
    }))
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
        comms_delivery: Arc::new(CommsDeliveryService::new_from_env(
            PersistenceStateStore::new(persistence_bootstrap.paths.clone()),
        )),
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
        .route("/threads/{thread_id}/run-ids", get(thread_run_ids))
        .route("/comms/accounts", get(list_comms_accounts).post(upsert_comms_account))
        .route("/comms/threads", get(list_comms_threads).post(create_comms_thread))
        .route(
            "/comms/threads/{thread_id}",
            patch(update_comms_thread).delete(delete_comms_thread),
        )
        .route(
            "/comms/threads/{thread_id}/messages",
            get(list_comms_messages).post(append_comms_message),
        )
        .route("/runs", post(start_run))
        .route("/runs/{run_id}/events", get(run_events))
        .route("/runs/{run_id}/cancel", post(cancel_run))
        .route("/debug/tools/execute", post(execute_debug_tool))
        .route("/work-units", get(list_work_units))
        .route("/work-units/dispatch", post(dispatch_work_unit))
        .with_state(app_state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787")
        .await
        .expect("failed to bind server listener");

    axum::serve(listener, app)
        .await
        .expect("server exited unexpectedly");
}
