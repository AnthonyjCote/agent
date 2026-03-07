use crate::{models::mailbox::InboxRecord, models::run::RunError};

pub trait InboxRepositoryPort {
    fn put(&self, record: InboxRecord) -> Result<(), RunError>;
    fn list_by_agent(&self, workspace_id: &str, agent_id: &str) -> Result<Vec<InboxRecord>, RunError>;
}
