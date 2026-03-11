use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{domain_ports::PersistenceCommsToolPort, PersistenceError, PersistenceStateStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommsManageExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

impl PersistenceStateStore {
    pub fn execute_comms_tool(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<CommsManageExecutionOutput, PersistenceError> {
        let port = PersistenceCommsToolPort::new(self.clone(), workspace_id.to_string());
        let output = app_domain_comms::CommsDomainService::default()
            .execute_tool_request(&port, args)
            .map_err(|error| PersistenceError::Io {
                context: "Comms domain execution failed",
                source: std::io::Error::new(std::io::ErrorKind::Other, error.to_string()),
                path: None,
            })?;
        Ok(CommsManageExecutionOutput {
            summary: output.summary,
            structured_data: output.structured_data,
        })
    }
}
