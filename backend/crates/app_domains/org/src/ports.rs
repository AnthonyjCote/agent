use app_domains_core::DomainResult;
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct OrgToolExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

pub trait OrgToolPort {
    fn execute_org_manage_entities_v2(&self, args: &Value) -> DomainResult<OrgToolExecutionOutput>;
}
