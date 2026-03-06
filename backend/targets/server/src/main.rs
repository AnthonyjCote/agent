use adapter::{list_seed_agents, server_capabilities, AgentSummary, RuntimeCapabilities};
use axum::{
    routing::get,
    Json, Router,
};
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

#[tokio::main]
async fn main() {
    let _ = agent_server::server_ready();

    let app = Router::new()
        .route("/health", get(health))
        .route("/capabilities", get(capabilities))
        .route("/agents", get(agents))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787")
        .await
        .expect("failed to bind server listener");

    axum::serve(listener, app)
        .await
        .expect("server exited unexpectedly");
}
