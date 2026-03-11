use app_domains_core::DomainResult;
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct OrgToolExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

#[derive(Debug, Clone)]
pub struct OrgChartStateRecord {
    pub snapshot: Value,
    pub activity_events: Value,
    pub command_history: Value,
    pub history_cursor: i64,
}

pub trait OrgToolStore {
    fn load_org_chart_state(&self) -> DomainResult<Option<OrgChartStateRecord>>;
    fn save_org_chart_state(&self, state: &OrgChartStateRecord) -> DomainResult<()>;
    fn list_agent_manifests(&self) -> DomainResult<Vec<Value>>;
    fn replace_agent_manifests(&self, manifests: &[Value]) -> DomainResult<()>;
}
