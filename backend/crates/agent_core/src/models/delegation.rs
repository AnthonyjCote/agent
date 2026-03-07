use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DelegationStatus {
    Requested,
    Accepted,
    Rejected,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegationRecord {
    pub workspace_id: String,
    pub delegation_id: String,
    pub parent_run_id: String,
    pub child_run_id: Option<String>,
    pub from_agent_id: String,
    pub to_agent_id: String,
    pub task_id: String,
    pub status: DelegationStatus,
}
