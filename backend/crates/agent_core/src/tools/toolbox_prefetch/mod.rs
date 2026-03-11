use serde::{Deserialize, Serialize};

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::comms_tool::prefetch::{
        resolve_message_check_prefetch_from_tools, resolve_message_send_prefetch_from_tools,
        MessageMethod,
    },
    tools::registry::execute_tool_by_id,
};

pub mod manifest;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefetchSpecRaw {
    pub tool: String,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub args: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct PrefetchSpec {
    pub tool: String,
    pub intent: Option<String>,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefetchPacket {
    pub tool: String,
    pub intent: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_data: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clarification_prompt: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PrefetchResolution {
    pub requested_tool_ids: Vec<String>,
    pub detail_blocks: Vec<String>,
    pub packets: Vec<PrefetchPacket>,
    pub clarification_prompt: Option<String>,
    pub work_log_entries: Vec<String>,
}

impl PrefetchResolution {
    pub fn empty() -> Self {
        Self {
            requested_tool_ids: Vec::new(),
            detail_blocks: Vec::new(),
            packets: Vec::new(),
            clarification_prompt: None,
            work_log_entries: Vec::new(),
        }
    }
}

fn run_tool_call_for_prefetch(
    tool_name: &str,
    args: &serde_json::Value,
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> Result<Option<ToolOutputEnvelope>, RunError> {
    match execute_tool_by_id(tool_name, args) {
        Ok(Some(output)) => Ok(Some(output)),
        Ok(None) => executor(tool_name, args),
        Err(error) => Err(error),
    }
}

pub fn resolve_prefetch(
    specs: &[PrefetchSpec],
    allowed_tool_ids: &[String],
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> PrefetchResolution {
    let mut resolution = PrefetchResolution::empty();
    if specs.is_empty() {
        return resolution;
    }
    let allowed_set = allowed_tool_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();

    for spec in specs {
        if !allowed_set.contains(spec.tool.as_str()) {
            continue;
        }
        if !resolution.requested_tool_ids.iter().any(|value| value == &spec.tool) {
            resolution.requested_tool_ids.push(spec.tool.clone());
        }

        if spec.tool == "org_manage_entities_v2" {
            let intent = spec.intent.as_deref().unwrap_or("");
            let read_args = match intent {
                "org_read_snapshot" => Some(serde_json::json!({
                    "action":"read",
                    "items":[{"target":"snapshot"}]
                })),
                "org_read_unit" => {
                    let unit_ref = spec
                        .args
                        .get("unit_ref")
                        .or_else(|| spec.args.get("name_ref"))
                        .and_then(|value| value.as_str())
                        .map(str::trim)
                        .unwrap_or("");
                    if unit_ref.is_empty() {
                        None
                    } else {
                        Some(serde_json::json!({
                            "action":"read",
                            "items":[{"target":"org_unit","name_ref":unit_ref}]
                        }))
                    }
                }
                "org_read_operator" => {
                    let name_ref = spec
                        .args
                        .get("name_ref")
                        .and_then(|value| value.as_str())
                        .map(str::trim)
                        .unwrap_or("");
                    if name_ref.is_empty() {
                        None
                    } else {
                        Some(serde_json::json!({
                            "action":"read",
                            "items":[{"target":"operator","name_ref":name_ref}]
                        }))
                    }
                }
                _ => None,
            };

            if let Some(args) = read_args {
                match run_tool_call_for_prefetch("org_manage_entities_v2", &args, executor) {
                    Ok(Some(output)) => {
                        resolution.packets.push(PrefetchPacket {
                            tool: "org_manage_entities_v2".to_string(),
                            intent: intent.to_string(),
                            status: "resolved".to_string(),
                            resolved_data: output.structured_data.clone(),
                            clarification_prompt: None,
                        });
                        resolution.detail_blocks.push(
                            "tool: org_manage_entities_v2\nintent: prefetch read\nprefetch contract:\n- Prefetch provides compact org context to deep stage.\n- Use app tool calls only for follow-up reads/writes beyond provided prefetch packet.\n".to_string()
                        );
                        resolution.work_log_entries.push(format!(
                            "Prefetch org_manage_entities_v2 intent={} status=resolved",
                            intent
                        ));
                    }
                    Ok(None) => {
                        resolution.packets.push(PrefetchPacket {
                            tool: "org_manage_entities_v2".to_string(),
                            intent: intent.to_string(),
                            status: "unresolved".to_string(),
                            resolved_data: None,
                            clarification_prompt: None,
                        });
                        resolution.work_log_entries.push(format!(
                            "Prefetch org_manage_entities_v2 intent={} status=unresolved",
                            intent
                        ));
                    }
                    Err(error) => {
                        resolution.packets.push(PrefetchPacket {
                            tool: "org_manage_entities_v2".to_string(),
                            intent: intent.to_string(),
                            status: "failed".to_string(),
                            resolved_data: Some(serde_json::json!({
                                "error": error.message
                            })),
                            clarification_prompt: None,
                        });
                        resolution.work_log_entries.push(format!(
                            "Prefetch org_manage_entities_v2 intent={} failed={}",
                            intent,
                            error.code
                        ));
                    }
                }
            } else {
                resolution.packets.push(PrefetchPacket {
                    tool: "org_manage_entities_v2".to_string(),
                    intent: intent.to_string(),
                    status: "missing_input".to_string(),
                    resolved_data: None,
                    clarification_prompt: None,
                });
                resolution.work_log_entries.push(format!(
                    "Prefetch org_manage_entities_v2 intent={} missing_input",
                    intent
                ));
            }
            continue;
        }

        if spec.tool != "comms_tool" {
            continue;
        }
        let intent = spec.intent.as_deref().unwrap_or("");
        if intent != "message_send" && intent != "message_check" {
            continue;
        }

        if intent == "message_check" {
            let method = spec
                .args
                .get("method")
                .and_then(|value| value.as_str())
                .and_then(MessageMethod::parse);
            let Some(method) = method else {
                resolution.packets.push(PrefetchPacket {
                    tool: "comms_tool".to_string(),
                    intent: "message_check".to_string(),
                    status: "missing_input".to_string(),
                    resolved_data: None,
                    clarification_prompt: None,
                });
                resolution.work_log_entries.push(
                    "Prefetch comms_tool/message_check missing required arg: method".to_string(),
                );
                continue;
            };
            let folder = spec
                .args
                .get("folder")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("inbox");
            let query = spec
                .args
                .get("query")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .unwrap_or("");
            let from_participant = spec
                .args
                .get("from_participant")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let to_participant = spec
                .args
                .get("to_participant")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let subject_contains = spec
                .args
                .get("subject_contains")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let state = spec
                .args
                .get("state")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let resolved = resolve_message_check_prefetch_from_tools(
                method.clone(),
                folder,
                query,
                from_participant,
                to_participant,
                subject_contains,
                state,
                executor,
            );
            let candidate_threads = resolved
                .candidates
                .iter()
                .take(10)
                .map(|thread| {
                    serde_json::json!({
                        "threadId": thread.thread_id,
                        "subject": thread.subject,
                        "from": thread.from,
                        "state": thread.state,
                        "lastMessageAtMs": thread.last_message_at_ms
                    })
                })
                .collect::<Vec<_>>();
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_check".to_string(),
                status: "resolved".to_string(),
                resolved_data: Some(serde_json::json!({
                    "method": resolved.method.as_str(),
                    "folder": resolved.folder,
                    "query": resolved.query,
                    "filters": {
                        "fromParticipant": from_participant,
                        "toParticipant": to_participant,
                        "subjectContains": subject_contains,
                        "state": state
                    },
                    "candidateThreads": candidate_threads,
                    "recommendedThreadId": resolved.recommended_thread_id,
                    "prefetchedMessages": resolved.prefetched_messages
                })),
                clarification_prompt: None,
            });
            let read_threads_hint = if query.is_empty() {
                format!(
                    "{{\"ops\":[{{\"action\":\"read\",\"target\":\"threads\",\"selector\":{{\"channel\":\"{}\",\"folder\":\"{}\",\"limit\":20}}}}]}}",
                    method.as_str(),
                    folder
                )
            } else {
                format!(
                    "{{\"ops\":[{{\"action\":\"read\",\"target\":\"threads\",\"selector\":{{\"channel\":\"{}\",\"folder\":\"{}\",\"search\":\"{}\",\"limit\":20}}}}]}}",
                    method.as_str(),
                    folder,
                    query.replace('\"', "'")
                )
            };
            let direct_action_line = if resolved.recommended_thread_id.is_some() {
                "- Fast-path available: one clear thread match was pre-opened and messages were prefetched. Act directly on `prefetchedMessages` unless a fresh re-read is necessary.\n"
            } else {
                ""
            };
            resolution.detail_blocks.push(format!(
                "tool: comms_tool\nintent: message_check\nmethod: {}\nmethod-specific read contract:\n- Read scope is auto-enforced to current operator mailbox.\n- Do not pass sender IDs, operator IDs, or other operator references.\n- For higher-precision prefetch, provide structured filters in prefetch args when available: from_participant, to_participant, subject_contains, state.\n- Start by reading threads, then read messages from a returned threadId if needed.\n{}- Use this comms_tool args pattern (threads):\n{}\n- Use this comms_tool args pattern (messages):\n{{\"ops\":[{{\"action\":\"read\",\"target\":\"messages\",\"selector\":{{\"threadId\":\"<thread_id>\",\"limit\":50}}}}]}}\n",
                method.as_str(),
                direct_action_line,
                read_threads_hint
            ));
            resolution.work_log_entries.push(format!(
                "Prefetch comms_tool/message_check method={} folder={} query={} candidates={} fast_path={}",
                method.as_str(),
                folder,
                if query.is_empty() { "(none)" } else { query },
                resolved.candidates.len(),
                resolved.recommended_thread_id.is_some()
            ));
            continue;
        }

            let method = spec
                .args
                .get("method")
                .and_then(|value| value.as_str())
                .and_then(MessageMethod::parse);
        let recipient_ref = spec
            .args
            .get("recipient_ref")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .unwrap_or("");

        let Some(method) = method else {
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_send".to_string(),
                status: "missing_input".to_string(),
                resolved_data: None,
                clarification_prompt: None,
            });
            resolution.work_log_entries.push(
                "Prefetch comms_tool/message_send missing required arg: method".to_string(),
            );
            continue;
        };

        if recipient_ref.is_empty() {
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_send".to_string(),
                status: "missing_input".to_string(),
                resolved_data: None,
                clarification_prompt: None,
            });
            resolution.work_log_entries.push(
                "Prefetch comms_tool/message_send missing required arg: recipient_ref".to_string(),
            );
            continue;
        }

        let resolved = resolve_message_send_prefetch_from_tools(method.clone(), recipient_ref, executor);
        let candidate_data = resolved
            .candidates
            .iter()
            .map(|candidate| {
                serde_json::json!({
                    "name": candidate.name,
                    "title": candidate.title,
                    method.field_label(): candidate.destination,
                })
            })
            .collect::<Vec<_>>();
        let status = if candidate_data.is_empty() {
            "unresolved"
        } else if candidate_data.len() > 1 {
            "ambiguous"
        } else {
            "resolved"
        };
        resolution.packets.push(PrefetchPacket {
            tool: "comms_tool".to_string(),
            intent: "message_send".to_string(),
            status: status.to_string(),
            resolved_data: Some(serde_json::json!({
                "method": resolved.method.as_str(),
                "recipientRef": resolved.recipient_ref,
                "matches": candidate_data
            })),
            clarification_prompt: None,
        });
        resolution.detail_blocks.push(format!(
            "tool: comms_tool\nintent: message_send\nmethod: {}\nmethod-specific send contract:\n- Sender identity is auto-enforced from current operator.\n- Do not provide sender account IDs or sender addresses; runtime injects sender deterministically.\n- Use exactly one-step send: one `create message` op only (do not create thread first).\n- Use the exact resolved {} destination from prefetch matches; do not substitute or invent another recipient.\n- Do not use other channel fields.\n- Use this comms_tool args pattern:\n{}\n",
            method.as_str(),
            method.field_label(),
            method.send_args_hint()
        ));
        resolution.work_log_entries.push(format!(
            "Prefetch comms_tool/message_send method={} recipient_ref={} matches={}",
            method.as_str(),
            recipient_ref,
            resolved.candidates.len()
        ));
    }

    resolution
}
