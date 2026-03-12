#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adapter::{desktop_capabilities, list_seed_agents, AgentSummary, RuntimeCapabilities};
use app_persistence::{
    bootstrap_workspace, OrgChartStateRecord, PersistenceHealthReport, PersistenceStateStore,
    CommsDeliveryService, SendChatInput, SendEmailInput, SendSmsInput,
    CommsAccountRecord, CommsMessageRecord, CommsThreadRecord, ThreadMessageRecord, ThreadRecord,
    WorkUnitRecord,
};
use agent_desktop::runtime_service::{RuntimeService, StartRunInput};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCommsAccountsInput {
    operator_id: Option<String>,
    channel: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertCommsAccountInput {
    account_id: String,
    operator_id: String,
    channel: String,
    address: String,
    display_name: String,
    status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCommsThreadsInput {
    channel: Option<String>,
    account_id: Option<String>,
    folder: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCommsThreadInput {
    channel: String,
    account_id: String,
    title: Option<String>,
    subject: Option<String>,
    participants: Option<serde_json::Value>,
    folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCommsThreadInput {
    title: Option<String>,
    subject: Option<String>,
    state: Option<String>,
    folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendCommsMessageInput {
    thread_id: String,
    direction: Option<String>,
    from_account_ref: String,
    to_participants: Option<serde_json::Value>,
    cc_participants: Option<serde_json::Value>,
    bcc_participants: Option<serde_json::Value>,
    subject: Option<String>,
    body_text: String,
    reply_to_message_id: Option<String>,
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

#[tauri::command]
fn list_comms_accounts(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: Option<ListCommsAccountsInput>,
) -> Result<Vec<CommsAccountRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let input = input.unwrap_or(ListCommsAccountsInput {
        operator_id: None,
        channel: None,
    });
    state_store
        .list_comms_accounts(
            &workspace_id,
            input.operator_id.as_deref(),
            input.channel.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn upsert_comms_account(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: UpsertCommsAccountInput,
) -> Result<CommsAccountRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .upsert_comms_account(
            &workspace_id,
            input.account_id.trim(),
            input.operator_id.trim(),
            input.channel.trim(),
            input.address.trim(),
            input.display_name.trim(),
            input.status.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_comms_threads(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: Option<ListCommsThreadsInput>,
) -> Result<Vec<CommsThreadRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let input = input.unwrap_or(ListCommsThreadsInput {
        channel: None,
        account_id: None,
        folder: None,
        search: None,
        limit: None,
        offset: None,
    });
    state_store
        .list_comms_threads(
            &workspace_id,
            input.channel.as_deref(),
            input.account_id.as_deref(),
            input.folder.as_deref(),
            input.search.as_deref(),
            input.limit.unwrap_or(200),
            input.offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_comms_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: CreateCommsThreadInput,
) -> Result<CommsThreadRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .create_comms_thread(
            &workspace_id,
            input.channel.trim(),
            input.account_id.trim(),
            input.title.as_deref(),
            input.subject.as_deref(),
            input.participants.as_ref(),
            input.folder.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn update_comms_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
    input: UpdateCommsThreadInput,
) -> Result<CommsThreadRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .update_comms_thread(
            &workspace_id,
            &thread_id,
            input.title.as_deref(),
            input.subject.as_deref(),
            input.state.as_deref(),
            input.folder.as_deref(),
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Comms thread not found.".to_string())
}

#[tauri::command]
fn delete_comms_thread(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
) -> Result<(), String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .delete_comms_thread(&workspace_id, &thread_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_comms_messages(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    thread_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<CommsMessageRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .list_comms_messages(
            &workspace_id,
            &thread_id,
            limit.unwrap_or(500),
            offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn append_comms_message(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    comms_delivery: State<'_, Arc<CommsDeliveryService>>,
    input: AppendCommsMessageInput,
) -> Result<CommsMessageRecord, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let direction = input.direction.as_deref().unwrap_or("outbound");
    let thread = state_store
        .get_comms_thread(&workspace_id, input.thread_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Comms thread not found.".to_string())?;

    if thread.channel == "email" && direction.eq_ignore_ascii_case("outbound") {
        return comms_delivery
            .send_email(
                &workspace_id,
                SendEmailInput {
                    thread_id: input.thread_id.trim().to_string(),
                    from_account_ref: input.from_account_ref.trim().to_string(),
                    to_participants: input.to_participants.clone(),
                    cc_participants: input.cc_participants.clone(),
                    bcc_participants: input.bcc_participants.clone(),
                    subject: input.subject.clone(),
                    body_text: input.body_text.clone(),
                    reply_to_message_id: input.reply_to_message_id.clone(),
                },
            )
            .map_err(|error| error.to_string());
    }
    if thread.channel == "sms" && direction.eq_ignore_ascii_case("outbound") {
        return comms_delivery
            .send_sms(
                &workspace_id,
                SendSmsInput {
                    thread_id: input.thread_id.trim().to_string(),
                    from_account_ref: input.from_account_ref.trim().to_string(),
                    to_participants: input.to_participants.clone(),
                    body_text: input.body_text.clone(),
                    reply_to_message_id: input.reply_to_message_id.clone(),
                },
            )
            .map_err(|error| error.to_string());
    }
    if thread.channel == "chat" && direction.eq_ignore_ascii_case("outbound") {
        return comms_delivery
            .send_chat(
                &workspace_id,
                SendChatInput {
                    thread_id: input.thread_id.trim().to_string(),
                    from_account_ref: input.from_account_ref.trim().to_string(),
                    to_participants: input.to_participants.clone(),
                    body_text: input.body_text.clone(),
                    reply_to_message_id: input.reply_to_message_id.clone(),
                },
            )
            .map_err(|error| error.to_string());
    }

    state_store
        .append_comms_message(
            &workspace_id,
            input.thread_id.trim(),
            direction,
            input.from_account_ref.trim(),
            input.to_participants.as_ref(),
            input.cc_participants.as_ref(),
            input.bcc_participants.as_ref(),
            input.subject.as_deref(),
            &input.body_text,
            input.reply_to_message_id.as_deref(),
        )
        .map_err(|error| error.to_string())
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

#[tauri::command]
fn list_work_units(
    state_store: State<'_, Arc<PersistenceStateStore>>,
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<WorkUnitRecord>, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    state_store
        .list_work_units(
            &workspace_id,
            status.as_deref(),
            limit.unwrap_or(200),
            offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn dispatch_work_unit(
    runtime: State<'_, Arc<RuntimeService>>,
    state_store: State<'_, Arc<PersistenceStateStore>>,
    input: DispatchWorkUnitInput,
) -> Result<DispatchWorkUnitResponse, String> {
    let workspace_id = state_store.workspace_id().map_err(|error| error.to_string())?;
    let work_unit = input.work_unit;
    let object = work_unit
        .as_object()
        .ok_or_else(|| "workUnit must be an object".to_string())?;
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
        .ok_or_else(|| "workUnit.domain is required".to_string())?;
    let action_type = object
        .get("actionType")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "workUnit.actionType is required".to_string())?;
    let target_operator = object
        .get("targetOperator")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "workUnit.targetOperator is required".to_string())?;
    let dedupe_key = object
        .get("idempotency")
        .and_then(|value| value.get("dedupeKey"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "workUnit.idempotency.dedupeKey is required".to_string())?;
    let correlation_id = object
        .get("trace")
        .and_then(|value| value.get("correlationId"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "workUnit.trace.correlationId is required".to_string())?;
    let causation_id = object
        .get("trace")
        .and_then(|value| value.get("causationId"))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "workUnit.trace.causationId is required".to_string())?;
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
                runtime.reserve_run(&generated_run_id, &workspace_id, &run_payload.thread_id);
                let runtime_cloned = runtime.inner().clone();
                let workspace_id_for_run = workspace_id.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = runtime_cloned.start_run(StartRunInput {
                        workspace_id: workspace_id_for_run,
                        run_id: generated_run_id,
                        thread_id: run_payload.thread_id,
                        agent_id: run_payload.agent_id,
                        agent_name: run_payload.agent_name,
                        agent_role: run_payload.agent_role,
                        agent_business_unit_name: run_payload.agent_business_unit_name,
                        agent_org_unit_name: run_payload.agent_org_unit_name,
                        agent_primary_objective: run_payload.agent_primary_objective,
                        system_directive_short: run_payload.system_directive_short,
                        sender: run_payload.sender,
                        recipient: run_payload.recipient,
                        message: run_payload.message,
                        allowed_tool_ids: run_payload.allowed_tool_ids,
                    });
                });
            }
        }
    }

    state_store
        .upsert_work_unit(
            &workspace_id,
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
        .map_err(|error| error.to_string())?;

    Ok(DispatchWorkUnitResponse {
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
    })
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
            agent_business_unit_name: payload.agent_business_unit_name,
            agent_org_unit_name: payload.agent_org_unit_name,
            agent_primary_objective: payload.agent_primary_objective,
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
fn cancel_run(runtime: State<'_, Arc<RuntimeService>>, run_id: String) -> bool {
    runtime.cancel_run(&run_id)
}

#[tauri::command]
fn list_thread_run_ids(
    runtime: State<'_, Arc<RuntimeService>>,
    thread_id: String,
    limit: Option<i64>,
) -> Vec<String> {
    runtime.list_thread_run_ids(&thread_id, limit.unwrap_or(50))
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
    let workspace_id = persistence_bootstrap.metadata.workspace_id.clone();
    let runtime_store = PersistenceStateStore::new(persistence_bootstrap.paths.clone());
    let runtime = Arc::new(RuntimeService::new(runtime_store, workspace_id));
    let persistence_health = Arc::new(persistence_bootstrap.health);
    let persistence_state_store = Arc::new(PersistenceStateStore::new(
        persistence_bootstrap.paths.clone(),
    ));
    let comms_delivery = Arc::new(CommsDeliveryService::new_from_env(
        PersistenceStateStore::new(persistence_bootstrap.paths.clone()),
    ));

    tauri::Builder::default()
        .manage(runtime)
        .manage(persistence_health)
        .manage(persistence_state_store)
        .manage(comms_delivery)
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
            list_comms_accounts,
            upsert_comms_account,
            list_comms_threads,
            create_comms_thread,
            update_comms_thread,
            delete_comms_thread,
            list_comms_messages,
            append_comms_message,
            list_work_units,
            dispatch_work_unit,
            start_run,
            cancel_run,
            list_run_events,
            list_thread_run_ids,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
