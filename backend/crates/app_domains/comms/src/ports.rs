use app_domains_core::DomainResult;
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct CommsToolExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

pub trait CommsToolPort {
    fn execute_comms_tool(&self, args: &Value) -> DomainResult<CommsToolExecutionOutput>;
}
