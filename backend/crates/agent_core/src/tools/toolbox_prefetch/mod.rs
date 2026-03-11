use serde::{Deserialize, Serialize};

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::comms_tool::prefetch::{
        resolve_message_send_prefetch_from_tools, MessageMethod,
    },
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
                let question = "Which channel should I check: email, sms, or chat?".to_string();
                resolution.packets.push(PrefetchPacket {
                    tool: "comms_tool".to_string(),
                    intent: "message_check".to_string(),
                    status: "missing_input".to_string(),
                    resolved_data: None,
                    clarification_prompt: Some(question.clone()),
                });
                if resolution.clarification_prompt.is_none() {
                    resolution.clarification_prompt = Some(question);
                }
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
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_check".to_string(),
                status: "resolved".to_string(),
                resolved_data: Some(serde_json::json!({
                    "method": method.as_str(),
                    "folder": folder,
                    "query": query,
                })),
                clarification_prompt: None,
            });
            resolution.detail_blocks.push(format!(
                "tool: comms_tool\nintent: message_check\nmethod: {}\nmethod-specific read contract:\n- Read scope is auto-enforced to current operator mailbox.\n- Do not pass sender IDs, operator IDs, or other operator references.\n- Start by reading threads, then read messages from a returned threadId if needed.\n- Use this comms_tool args pattern (threads):\n{}\n- Use this comms_tool args pattern (messages):\n{{\"ops\":[{{\"action\":\"read\",\"target\":\"messages\",\"selector\":{{\"threadId\":\"<thread_id>\",\"limit\":50}}}}]}}\n",
                method.as_str(),
                read_threads_hint
            ));
            resolution.work_log_entries.push(format!(
                "Prefetch comms_tool/message_check method={} folder={} query={}",
                method.as_str(),
                folder,
                if query.is_empty() { "(none)" } else { query }
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
            let question = "Which contact method should I use for this message: email, sms, or chat?".to_string();
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_send".to_string(),
                status: "missing_input".to_string(),
                resolved_data: None,
                clarification_prompt: Some(question.clone()),
            });
            if resolution.clarification_prompt.is_none() {
                resolution.clarification_prompt = Some(question);
            }
            continue;
        };

        if recipient_ref.is_empty() {
            let question = format!("Who should I contact via {}?", method.as_str());
            resolution.packets.push(PrefetchPacket {
                tool: "comms_tool".to_string(),
                intent: "message_send".to_string(),
                status: "missing_input".to_string(),
                resolved_data: None,
                clarification_prompt: Some(question.clone()),
            });
            if resolution.clarification_prompt.is_none() {
                resolution.clarification_prompt = Some(question);
            }
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
        let status = if resolved.clarification_question.is_some() {
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
            clarification_prompt: resolved.clarification_question.clone(),
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
        if resolution.clarification_prompt.is_none() {
            resolution.clarification_prompt = resolved.clarification_question;
        }
    }

    resolution
}
