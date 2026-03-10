use serde_json::Value;

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::{
        app_dispatch::AppToolBackend,
        org_manage_entities_v2::{input::parse_args, output::to_envelope},
    },
};

pub fn execute_org_manage_entities_v2(
    backend: &dyn AppToolBackend,
    args: &Value,
) -> Result<ToolOutputEnvelope, RunError> {
    let parsed = parse_args(args)?;
    let output = backend.execute_org_manage_entities_v2(&parsed)?;
    Ok(to_envelope(output))
}
