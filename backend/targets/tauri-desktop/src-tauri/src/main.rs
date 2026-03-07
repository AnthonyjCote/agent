#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use adapter::{desktop_capabilities, list_seed_agents, AgentSummary, RuntimeCapabilities};
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
    let runtime = Arc::new(RuntimeService::new());

    tauri::Builder::default()
        .manage(runtime)
        .invoke_handler(tauri::generate_handler![
            get_capabilities,
            list_agents,
            start_run,
            list_run_events,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
