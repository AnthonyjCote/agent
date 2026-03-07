use serde::{Deserialize, Serialize};

use crate::models::{blocks::MessageBlock, channels::ChannelEnvelope, side_effect::SideEffectLifecycleState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub workspace_id: String,
    pub run_id: String,
    pub thread_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub agent_role: String,
    pub system_directive_short: String,
    pub input: ChannelEnvelope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Running,
    WaitingTool,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub pruned_tokens: u32,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "event")]
pub enum RunEvent {
    RunStarted {
        workspace_id: String,
        run_id: String,
        thread_id: String,
        policy_snapshot_version: String,
        context_hash: String,
    },
    ModelDelta {
        run_id: String,
        phase: String,
        text: String,
    },
    DebugModelRequest {
        run_id: String,
        phase: String,
        payload: String,
    },
    DebugModelResponse {
        run_id: String,
        phase: String,
        payload: String,
    },
    DebugModelStreamLine {
        run_id: String,
        phase: String,
        line: String,
    },
    BlocksProduced {
        run_id: String,
        blocks: Vec<MessageBlock>,
    },
    ToolUse {
        run_id: String,
        call_id: String,
        tool_name: String,
        lifecycle: SideEffectLifecycleState,
    },
    ToolResult {
        run_id: String,
        call_id: String,
        tool_name: String,
        lifecycle: SideEffectLifecycleState,
    },
    DebugToolResult {
        run_id: String,
        call_id: String,
        tool_name: String,
        output: serde_json::Value,
    },
    DelegationRequested {
        run_id: String,
        delegation_id: String,
        target_agent_id: String,
    },
    DelegationResolved {
        run_id: String,
        delegation_id: String,
        success: bool,
    },
    ChannelDispatch {
        run_id: String,
        correlation_id: String,
        lifecycle: SideEffectLifecycleState,
    },
    RunCompleted {
        run_id: String,
        usage: Option<RunUsage>,
    },
    RunFailed {
        run_id: String,
        error: RunError,
    },
    RunCancelled {
        run_id: String,
    },
}
