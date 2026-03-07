use crate::{
    models::channels::DeliveryStatus,
    models::mailbox::OutboxRecord,
    models::run::RunError,
};

pub trait OutboxRepositoryPort {
    fn put(&self, record: OutboxRecord) -> Result<(), RunError>;
    fn update_status(
        &self,
        workspace_id: &str,
        message_id: &str,
        status: DeliveryStatus,
    ) -> Result<(), RunError>;
    fn list_by_agent(&self, workspace_id: &str, agent_id: &str) -> Result<Vec<OutboxRecord>, RunError>;
}
