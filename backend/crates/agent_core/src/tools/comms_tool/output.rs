use crate::{
    models::tool::ToolOutputEnvelope,
    tools::app_dispatch::AppToolExecutionOutput,
};

pub fn to_envelope(output: AppToolExecutionOutput) -> ToolOutputEnvelope {
    ToolOutputEnvelope {
        summary: output.summary,
        structured_data: Some(output.structured_data),
        artifacts: Vec::new(),
        errors: Vec::new(),
    }
}
