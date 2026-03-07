use crate::models::{channels::{ChannelEnvelope, DeliveryStatus}, run::RunError};

#[derive(Debug, Clone)]
pub struct DeliveryUpdate {
    pub workspace_id: String,
    pub correlation_id: String,
    pub status: DeliveryStatus,
    pub message: Option<String>,
}

pub trait ChannelPort {
    fn receive(&self) -> Result<Vec<ChannelEnvelope>, RunError>;
    fn send(&self, envelope: ChannelEnvelope) -> Result<(), RunError>;
    fn update_delivery(&self, update: DeliveryUpdate) -> Result<(), RunError>;
}
