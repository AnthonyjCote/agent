use app_domain_comms::ports::CommsToolPort;
use app_domain_org::ports::OrgToolPort;
use app_domains_core::errors::DomainError;
use app_persistence::{PersistenceCommsToolPort, PersistenceOrgToolPort, PersistenceStateStore};
use agent_core::{
    models::run::RunError,
    tools::app_dispatch::{AppToolBackend, AppToolExecutionOutput},
};

#[derive(Clone)]
pub struct PersistentAppToolBackend {
    org_port: PersistenceOrgToolPort,
    comms_port: PersistenceCommsToolPort,
}

impl PersistentAppToolBackend {
    pub fn new(state_store: PersistenceStateStore, workspace_id: String) -> Self {
        let org_port = PersistenceOrgToolPort::new(state_store.clone(), workspace_id.clone());
        let comms_port = PersistenceCommsToolPort::new(state_store, workspace_id);
        Self {
            org_port,
            comms_port,
        }
    }

    fn map_org_error(error: DomainError) -> RunError {
        RunError {
            code: "org_manage_tool_failed".to_string(),
            message: error.to_string(),
            retryable: false,
        }
    }

    fn map_comms_error(error: DomainError) -> RunError {
        RunError {
            code: "comms_tool_failed".to_string(),
            message: error.to_string(),
            retryable: false,
        }
    }
}

impl AppToolBackend for PersistentAppToolBackend {
    fn execute_org_manage_entities_v2(
        &self,
        args: &serde_json::Value,
    ) -> Result<AppToolExecutionOutput, RunError> {
        let output = self
            .org_port
            .execute_org_manage_entities_v2(args)
            .map_err(Self::map_org_error)?;
        Ok(AppToolExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }

    fn execute_comms_tool(
        &self,
        args: &serde_json::Value,
    ) -> Result<AppToolExecutionOutput, RunError> {
        let output = self
            .comms_port
            .execute_comms_tool(args)
            .map_err(Self::map_comms_error)?;
        Ok(AppToolExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }
}
