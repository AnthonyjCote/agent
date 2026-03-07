use crate::models::{run::RunError, tool::{ToolCallRequest, ToolCallResult}};

pub trait ToolExecutionPort {
    fn execute(&self, request: ToolCallRequest) -> Result<ToolCallResult, RunError>;
}
