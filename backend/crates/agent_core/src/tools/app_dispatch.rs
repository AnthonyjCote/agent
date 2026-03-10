use serde_json::Value;

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::{comms_tool::handler::execute_comms_tool, org_manage_entities_v2::handler::execute_org_manage_entities_v2},
};

#[derive(Debug, Clone)]
pub struct AppToolExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

pub trait AppToolBackend {
    fn execute_org_manage_entities_v2(&self, args: &Value) -> Result<AppToolExecutionOutput, RunError>;
    fn execute_comms_tool(&self, args: &Value) -> Result<AppToolExecutionOutput, RunError>;
}

pub fn execute_app_tool_by_id(
    backend: &dyn AppToolBackend,
    tool_name: &str,
    args: &Value,
) -> Result<Option<ToolOutputEnvelope>, RunError> {
    match tool_name {
        "org_manage_entities_v2" => execute_org_manage_entities_v2(backend, args).map(Some),
        "comms_tool" => execute_comms_tool(backend, args).map(Some),
        _ => Ok(None),
    }
}
