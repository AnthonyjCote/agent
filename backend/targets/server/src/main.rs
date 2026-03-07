use adapter::{list_seed_agents, server_capabilities, AgentSummary, RuntimeCapabilities};
use agent_core::models::{
    channels::{ChannelEnvelope, ChannelKind},
    run::RunRequest,
};
use agent_server::runtime_service::RuntimeService;
use axum::{
    extract::{Path, State},
    routing::post,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

async fn health() -> &'static str {
    "ok"
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
    State(runtime): State<Arc<RuntimeService>>,
    Json(payload): Json<StartRunPayload>,
) -> Json<StartRunResponse> {
    let workspace_id = payload.workspace_id;
    let run_id = payload.run_id;
    let thread_id = payload.thread_id;
    let agent_id = payload.agent_id;
    let agent_name = payload.agent_name;
    let agent_role = payload.agent_role;
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
            thread_id,
            task_id: None,
            correlation_id: "corr_v1_placeholder".to_string(),
            metadata: serde_json::json!({
                "message": message,
                "allowed_tool_ids": allowed_tool_ids
            }),
        },
    };

    runtime.reserve_run(&run_id, &workspace_id, &thread_id);
    let runtime_cloned = runtime.clone();
    tokio::spawn(async move {
        let _ = runtime_cloned.start_run(request);
    });

    Json(StartRunResponse { run_id })
}

async fn run_events(
    State(runtime): State<Arc<RuntimeService>>,
    Path(run_id): Path<String>,
) -> Json<Vec<agent_core::models::run::RunEvent>> {
    Json(runtime.list_run_events(&run_id))
}

#[tokio::main]
async fn main() {
    let _ = agent_server::server_ready();
    let runtime = Arc::new(RuntimeService::new());

    let app = Router::new()
        .route("/health", get(health))
        .route("/capabilities", get(capabilities))
        .route("/agents", get(agents))
        .route("/runs", post(start_run))
        .route("/runs/{run_id}/events", get(run_events))
        .with_state(runtime)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787")
        .await
        .expect("failed to bind server listener");

    axum::serve(listener, app)
        .await
        .expect("server exited unexpectedly");
}
