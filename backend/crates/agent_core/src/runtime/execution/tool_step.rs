use serde::Deserialize;

use crate::{
    models::{run::{RunError, RunEvent}, side_effect::SideEffectLifecycleState, tool::ToolOutputEnvelope},
    runtime::logging::work_log::compact_for_log,
    runtime::{events::event_writer::append_event, tracing::memory_trace_store::MemoryTraceStore},
    tools::registry::execute_tool_by_id,
};

#[derive(Debug, Deserialize)]
pub(crate) struct ModelToolEnvelope {
    #[serde(default)]
    pub tool_calls: Vec<ModelToolCall>,
    #[serde(default)]
    pub final_response: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModelToolCall {
    pub tool: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

pub(crate) fn parse_model_tool_envelope(raw_output: &str) -> Option<ModelToolEnvelope> {
    fn parse_candidate(candidate: &str) -> Option<ModelToolEnvelope> {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            return None;
        }
        let start = trimmed.find('{')?;
        let end = trimmed.rfind('}')?;
        if end <= start {
            return None;
        }
        serde_json::from_str::<ModelToolEnvelope>(&trimmed[start..=end]).ok()
    }

    let trimmed = raw_output.trim();
    if let Some(parsed) = parse_candidate(trimmed) {
        return Some(parsed);
    }
    for (index, ch) in trimmed.char_indices().rev() {
        if ch != '{' {
            continue;
        }
        if let Some(parsed) = parse_candidate(&trimmed[index..]) {
            return Some(parsed);
        }
    }
    None
}

pub(crate) fn format_tool_result_for_prompt(tool_name: &str, output: &ToolOutputEnvelope) -> String {
    let structured_preview = output
        .structured_data
        .as_ref()
        .and_then(|value| serde_json::to_string(value).ok())
        .map(|value| {
            if value.len() > 700 {
                format!("{}...", &value[..700])
            } else {
                value
            }
        })
        .unwrap_or_else(|| "null".to_string());
    format!(
        "Tool {} -> summary: {} | structured_preview: {}",
        tool_name, output.summary, structured_preview
    )
}

pub(crate) fn format_debug_tool_output(output: &ToolOutputEnvelope) -> serde_json::Value {
    let structured_preview = output
        .structured_data
        .as_ref()
        .and_then(|value| serde_json::to_string(value).ok())
        .map(|value| {
            if value.len() > 1600 {
                format!("{}...", &value[..1600])
            } else {
                value
            }
        })
        .unwrap_or_else(|| "null".to_string());

    serde_json::json!({
        "summary": output.summary,
        "structuredData": output.structured_data,
        "structuredDataPreview": structured_preview,
        "artifacts": output.artifacts,
        "errors": output.errors
    })
}

pub(crate) fn format_tool_error_for_prompt(tool_name: &str, error: &RunError) -> String {
    format!(
        "Tool {} failed: [{}] {}. Adjust args and retry if needed.",
        tool_name, error.code, error.message
    )
}

pub(crate) fn compact_tool_args_preview(args: &serde_json::Value, max_len: usize) -> String {
    let call_args_preview = serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());
    compact_for_log(&call_args_preview, max_len)
}

pub(crate) enum ToolStepControl {
    Continue,
}

pub(crate) fn execute_tool_calls_step(
    run_id: &str,
    step: usize,
    tool_calls: &[ModelToolCall],
    allowed_tool_ids: &[String],
    tool_executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
    tool_results_log: &mut Vec<String>,
    work_log: &mut Vec<String>,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> ToolStepControl {
    for (index, call) in tool_calls.iter().enumerate() {
        let call_id = format!("tool_{}_{}_{}", step, index + 1, call.tool);
        work_log.insert(
            0,
            format!(
                "Step {} tool call: {} args={}",
                step,
                call.tool,
                compact_tool_args_preview(&call.args, 280)
            ),
        );
        if work_log.len() > 24 {
            work_log.truncate(24);
        }
        if !allowed_tool_ids.iter().any(|tool_id| tool_id == call.tool.as_str()) {
            append_event(
                trace_store,
                on_event,
                RunEvent::ToolResult {
                    run_id: run_id.to_string(),
                    call_id: call_id.clone(),
                    tool_name: call.tool.clone(),
                    args: Some(call.args.clone()),
                    lifecycle: SideEffectLifecycleState::Failed,
                },
            );
            let error = RunError {
                code: "tool_not_allowed".to_string(),
                message: format!("Tool is not allowed for this agent: {}", call.tool),
                retryable: false,
            };
            append_event(
                trace_store,
                on_event,
                RunEvent::DebugToolResult {
                    run_id: run_id.to_string(),
                    call_id,
                    tool_name: call.tool.clone(),
                    output: serde_json::json!({
                        "error": {
                            "code": &error.code,
                            "message": &error.message,
                            "retryable": error.retryable
                        }
                    }),
                },
            );
            tool_results_log.insert(0, format_tool_error_for_prompt(&call.tool, &error));
            work_log.insert(
                0,
                format!(
                    "Step {} tool failed: {} [{}] {}",
                    step, call.tool, error.code, error.message
                ),
            );
            if work_log.len() > 24 {
                work_log.truncate(24);
            }
            if tool_results_log.len() > 12 {
                tool_results_log.truncate(12);
            }
            continue;
        }
        append_event(
            trace_store,
            on_event,
            RunEvent::ToolUse {
                run_id: run_id.to_string(),
                call_id: call_id.clone(),
                tool_name: call.tool.clone(),
                args: Some(call.args.clone()),
                lifecycle: SideEffectLifecycleState::Proposed,
            },
        );
        append_event(
            trace_store,
            on_event,
            RunEvent::ToolUse {
                run_id: run_id.to_string(),
                call_id: call_id.clone(),
                tool_name: call.tool.clone(),
                args: Some(call.args.clone()),
                lifecycle: SideEffectLifecycleState::Dispatched,
            },
        );

        let tool_result = match execute_tool_by_id(&call.tool, &call.args) {
            Ok(Some(builtin)) => Ok(Some(builtin)),
            Ok(None) => tool_executor(&call.tool, &call.args),
            Err(error) => Err(error),
        };
        match tool_result {
            Ok(Some(output)) => {
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::ToolResult {
                        run_id: run_id.to_string(),
                        call_id: call_id.clone(),
                        tool_name: call.tool.clone(),
                        args: Some(call.args.clone()),
                        lifecycle: SideEffectLifecycleState::Completed,
                    },
                );
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::DebugToolResult {
                        run_id: run_id.to_string(),
                        call_id,
                        tool_name: call.tool.clone(),
                        output: format_debug_tool_output(&output),
                    },
                );
                tool_results_log.insert(0, format_tool_result_for_prompt(&call.tool, &output));
                work_log.insert(
                    0,
                    format!(
                        "Step {} tool completed: {} -> {}",
                        step,
                        call.tool,
                        compact_for_log(&output.summary, 260)
                    ),
                );
                if work_log.len() > 24 {
                    work_log.truncate(24);
                }
                if tool_results_log.len() > 12 {
                    tool_results_log.truncate(12);
                }
            }
            Ok(None) => {
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::ToolResult {
                        run_id: run_id.to_string(),
                        call_id: call_id.clone(),
                        tool_name: call.tool.clone(),
                        args: Some(call.args.clone()),
                        lifecycle: SideEffectLifecycleState::Failed,
                    },
                );
                let error = RunError {
                    code: "tool_not_implemented".to_string(),
                    message: format!("Tool is not implemented: {}", call.tool),
                    retryable: false,
                };
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::DebugToolResult {
                        run_id: run_id.to_string(),
                        call_id,
                        tool_name: call.tool.clone(),
                        output: serde_json::json!({
                            "error": {
                                "code": &error.code,
                                "message": &error.message,
                                "retryable": error.retryable
                            }
                        }),
                    },
                );
                tool_results_log.insert(0, format_tool_error_for_prompt(&call.tool, &error));
                work_log.insert(
                    0,
                    format!(
                        "Step {} tool failed: {} [{}] {}",
                        step, call.tool, error.code, error.message
                    ),
                );
                if work_log.len() > 24 {
                    work_log.truncate(24);
                }
                if tool_results_log.len() > 12 {
                    tool_results_log.truncate(12);
                }
            }
            Err(error) => {
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::ToolResult {
                        run_id: run_id.to_string(),
                        call_id: call_id.clone(),
                        tool_name: call.tool.clone(),
                        args: Some(call.args.clone()),
                        lifecycle: SideEffectLifecycleState::Failed,
                    },
                );
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::DebugToolResult {
                        run_id: run_id.to_string(),
                        call_id,
                        tool_name: call.tool.clone(),
                        output: serde_json::json!({
                            "error": {
                                "code": &error.code,
                                "message": &error.message,
                                "retryable": error.retryable
                            }
                        }),
                    },
                );
                tool_results_log.insert(0, format_tool_error_for_prompt(&call.tool, &error));
                work_log.insert(
                    0,
                    format!(
                        "Step {} tool failed: {} [{}] {}",
                        step, call.tool, error.code, error.message
                    ),
                );
                if work_log.len() > 24 {
                    work_log.truncate(24);
                }
                if tool_results_log.len() > 12 {
                    tool_results_log.truncate(12);
                }
            }
        }
    }
    ToolStepControl::Continue
}
