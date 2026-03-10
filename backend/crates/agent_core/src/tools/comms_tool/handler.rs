use serde_json::Value;

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::{
        app_dispatch::AppToolBackend,
        comms_tool::{input::parse_args, output::to_envelope},
    },
};

pub fn execute_comms_tool(
    backend: &dyn AppToolBackend,
    args: &Value,
) -> Result<ToolOutputEnvelope, RunError> {
    let parsed = parse_args(args)?;
    let output = backend.execute_comms_tool(&parsed)?;
    Ok(to_envelope(output))
}
