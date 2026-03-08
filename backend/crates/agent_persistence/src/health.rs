use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PersistenceHealthState {
    Healthy,
    Degraded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceHealthReport {
    pub state: PersistenceHealthState,
    pub workspace_id: String,
    pub checks: Vec<HealthCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    pub key: String,
    pub ok: bool,
    pub detail: String,
}

impl PersistenceHealthReport {
    pub fn healthy(workspace_id: String, checks: Vec<HealthCheck>) -> Self {
        Self {
            state: PersistenceHealthState::Healthy,
            workspace_id,
            checks,
        }
    }

    pub fn from_checks(workspace_id: String, checks: Vec<HealthCheck>) -> Self {
        let failed = checks.iter().filter(|check| !check.ok).count();
        let state = if failed == 0 {
            PersistenceHealthState::Healthy
        } else {
            // V1: any failure is marked degraded unless zero checks were collected.
            PersistenceHealthState::Degraded
        };

        Self {
            state,
            workspace_id,
            checks,
        }
    }
}
