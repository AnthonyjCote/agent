use crate::{models::run::RunRequest, tools::toolbox::{allowed_tool_ids_from_metadata, render_toolbox_summary}};

#[derive(Debug, Clone)]
pub(crate) struct RunContext {
    pub run_id: String,
    pub workspace_id: String,
    pub thread_id: String,
    pub prompt: String,
    pub history_excerpt: String,
    pub allowed_tool_ids: Vec<String>,
    pub toolbox_summary: String,
    pub agent_name: String,
    pub agent_role: String,
    pub business_unit_name: String,
    pub org_unit_name: String,
    pub primary_objective: String,
    pub directive: String,
    pub org_compact_preload: String,
}

impl RunContext {
    pub(crate) fn from_request(request: &RunRequest) -> Self {
        let prompt = request
            .input
            .metadata
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let history_excerpt = request
            .input
            .metadata
            .get("history_excerpt")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let allowed_tool_ids = allowed_tool_ids_from_metadata(&request.input.metadata);
        let toolbox_summary = render_toolbox_summary(&allowed_tool_ids);
        let business_unit_name = request
            .input
            .metadata
            .get("agent_business_unit_name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let org_unit_name = request
            .input
            .metadata
            .get("agent_org_unit_name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let primary_objective = request
            .input
            .metadata
            .get("agent_primary_objective")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let org_compact_preload = request
            .input
            .metadata
            .get("org_compact_preload")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();

        Self {
            run_id: request.run_id.clone(),
            workspace_id: request.workspace_id.clone(),
            thread_id: request.thread_id.clone(),
            prompt,
            history_excerpt,
            allowed_tool_ids,
            toolbox_summary,
            agent_name: request.agent_name.clone(),
            agent_role: request.agent_role.clone(),
            business_unit_name,
            org_unit_name,
            primary_objective,
            directive: request.system_directive_short.clone(),
            org_compact_preload,
        }
    }
}

