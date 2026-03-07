pub mod gemini;
pub mod provider_adapter;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapabilities {
    pub supports_file_system_access: bool,
    pub supports_hosted_webhooks: bool,
    pub supports_local_listener: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummary {
    pub id: String,
    pub name: String,
}

pub fn adapter_ready() -> bool {
    agent_core::core_ready()
}

pub fn desktop_capabilities() -> RuntimeCapabilities {
    RuntimeCapabilities {
        supports_file_system_access: true,
        supports_hosted_webhooks: false,
        supports_local_listener: true,
    }
}

pub fn server_capabilities() -> RuntimeCapabilities {
    RuntimeCapabilities {
        supports_file_system_access: false,
        supports_hosted_webhooks: true,
        supports_local_listener: false,
    }
}

pub fn list_seed_agents() -> Vec<AgentSummary> {
    vec![
        AgentSummary {
            id: "agent-1".to_string(),
            name: "Coordinator".to_string(),
        },
        AgentSummary {
            id: "agent-2".to_string(),
            name: "Researcher".to_string(),
        },
    ]
}
