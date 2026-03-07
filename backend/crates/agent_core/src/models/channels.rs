use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChannelKind {
    ChatUi,
    InternalAgent,
    Email,
    Sms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelEnvelope {
    pub workspace_id: String,
    pub channel: ChannelKind,
    pub sender: String,
    pub recipient: String,
    pub thread_id: String,
    pub task_id: Option<String>,
    pub correlation_id: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryStatus {
    Queued,
    Sent,
    Delivered,
    Failed,
    Retried,
}
