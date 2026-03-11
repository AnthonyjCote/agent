use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{domain_ports::PersistenceOrgToolPort, PersistenceError, PersistenceStateStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgManageExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

impl PersistenceStateStore {
    pub fn build_org_compact_preload(&self, workspace_id: &str) -> Result<String, PersistenceError> {
        let port = PersistenceOrgToolPort::new(self.clone(), workspace_id.to_string());
        app_domain_org::tool_orchestration::build_org_compact_preload(&port).map_err(|error| {
            PersistenceError::Io {
                context: "Org preload generation failed",
                source: std::io::Error::new(std::io::ErrorKind::Other, error.to_string()),
                path: None,
            }
        })
    }

    pub fn execute_org_manage_entities_v2(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<OrgManageExecutionOutput, PersistenceError> {
        let port = PersistenceOrgToolPort::new(self.clone(), workspace_id.to_string());
        let output = app_domain_org::OrgDomainService::default()
            .execute_tool_request(&port, args)
            .map_err(|error| PersistenceError::Io {
                context: "Org domain execution failed",
                source: std::io::Error::new(std::io::ErrorKind::Other, error.to_string()),
                path: None,
            })?;
        Ok(OrgManageExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }

    pub fn execute_org_manage_entities_v1(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<OrgManageExecutionOutput, PersistenceError> {
        self.execute_org_manage_entities_v2(workspace_id, args)
    }
}
