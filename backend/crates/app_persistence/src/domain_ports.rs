use app_domain_comms::ports::{CommsToolExecutionOutput, CommsToolPort};
use app_domain_org::ports::{OrgToolExecutionOutput, OrgToolPort};
use app_domains_core::{errors::DomainError, DomainResult};

use crate::PersistenceStateStore;

#[derive(Clone)]
pub struct PersistenceOrgToolPort {
    store: PersistenceStateStore,
    workspace_id: String,
}

impl PersistenceOrgToolPort {
    pub fn new(store: PersistenceStateStore, workspace_id: impl Into<String>) -> Self {
        Self {
            store,
            workspace_id: workspace_id.into(),
        }
    }
}

impl OrgToolPort for PersistenceOrgToolPort {
    fn execute_org_manage_entities_v2(
        &self,
        args: &serde_json::Value,
    ) -> DomainResult<OrgToolExecutionOutput> {
        let output = self
            .store
            .execute_org_manage_entities_v2(&self.workspace_id, args)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Ok(OrgToolExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }
}

#[derive(Clone)]
pub struct PersistenceCommsToolPort {
    store: PersistenceStateStore,
    workspace_id: String,
}

impl PersistenceCommsToolPort {
    pub fn new(store: PersistenceStateStore, workspace_id: impl Into<String>) -> Self {
        Self {
            store,
            workspace_id: workspace_id.into(),
        }
    }
}

impl CommsToolPort for PersistenceCommsToolPort {
    fn execute_comms_tool(
        &self,
        args: &serde_json::Value,
    ) -> DomainResult<CommsToolExecutionOutput> {
        let output = self
            .store
            .execute_comms_tool(&self.workspace_id, args)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Ok(CommsToolExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }
}
