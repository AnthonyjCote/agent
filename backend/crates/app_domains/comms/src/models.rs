use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommsChannel {
    Email,
    Sms,
    Chat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundMessageDraft {
    pub channel: CommsChannel,
    pub sender: String,
    pub recipient: String,
    pub subject: Option<String>,
    pub body: String,
}
