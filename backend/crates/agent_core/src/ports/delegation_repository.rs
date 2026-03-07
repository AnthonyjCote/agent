use crate::{models::delegation::DelegationRecord, models::run::RunError};

pub trait DelegationRepositoryPort {
    fn put(&self, record: DelegationRecord) -> Result<(), RunError>;
    fn get(&self, workspace_id: &str, delegation_id: &str) -> Result<Option<DelegationRecord>, RunError>;
}
