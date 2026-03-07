use serde::{Deserialize, Serialize};

use crate::models::channels::{ChannelEnvelope, DeliveryStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxRecord {
    pub workspace_id: String,
    pub agent_id: String,
    pub message_id: String,
    pub envelope: ChannelEnvelope,
    pub received_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxRecord {
    pub workspace_id: String,
    pub agent_id: String,
    pub message_id: String,
    pub envelope: ChannelEnvelope,
    pub status: DeliveryStatus,
    pub updated_at: String,
}
