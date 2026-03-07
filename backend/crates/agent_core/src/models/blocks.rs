use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum MessageBlock {
    AssistantText { text: String },
    ToolCall {
        tool_name: String,
        call_id: String,
    },
    ToolResult {
        tool_name: String,
        call_id: String,
        result_summary: String,
    },
    SystemNotice { message: String },
    Error { message: String },
    Table { schema_ref: Option<String> },
    ChartSpec { schema_ref: Option<String> },
    FileArtifact { artifact_id: String },
}
