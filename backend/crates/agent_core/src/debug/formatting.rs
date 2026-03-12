use crate::models::run::RunEvent;

pub fn summarize_event(event: &RunEvent) -> String {
    match event {
        RunEvent::RunStarted { run_id, .. } => format!("run_started: {run_id}"),
        RunEvent::RunCompleted { run_id, .. } => format!("run_completed: {run_id}"),
        RunEvent::RunFailed { run_id, error } => {
            format!("run_failed: {run_id} ({})", error.message)
        }
        RunEvent::RunCancelled { run_id } => format!("run_cancelled: {run_id}"),
        RunEvent::ToolUse { tool_name, lifecycle, .. } => {
            format!("tool_use: {tool_name} ({lifecycle:?})")
        }
        RunEvent::ToolResult { tool_name, lifecycle, .. } => {
            format!("tool_result: {tool_name} ({lifecycle:?})")
        }
        _ => format!("{}", serde_json::to_string(event).unwrap_or_else(|_| "event".to_string())),
    }
}
