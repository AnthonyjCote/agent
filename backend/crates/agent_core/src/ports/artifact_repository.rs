use crate::models::run::RunError;

#[derive(Debug, Clone)]
pub struct ArtifactRef {
    pub workspace_id: String,
    pub run_id: String,
    pub artifact_id: String,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

pub trait ArtifactRepositoryPort {
    fn put(&self, artifact: ArtifactRef) -> Result<(), RunError>;
}
