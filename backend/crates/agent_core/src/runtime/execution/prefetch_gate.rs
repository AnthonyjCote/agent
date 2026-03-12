use crate::{
    models::{
        run::{RunError, RunEvent},
        tool::ToolOutputEnvelope,
    },
    runtime::{
        context::run_context::RunContext,
        events::event_writer::append_event,
        parsing::ack_decision_parser::AckEnvelope,
        tracing::memory_trace_store::MemoryTraceStore,
    },
    tools::{
        toolbox_prefetch::{resolve_prefetch, PrefetchResolution, PrefetchSpec},
    },
};

#[derive(Debug, Clone)]
pub(crate) struct PrefetchGateOutput {
    pub prefetched_tool_details: String,
    pub prefetch_resolution: PrefetchResolution,
}

pub(crate) fn run_prefetch_gate(
    context: &RunContext,
    ack_envelope: &AckEnvelope,
    tool_executor: &mut Option<
        &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
    >,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> Result<PrefetchGateOutput, Option<Vec<RunEvent>>> {
    fn normalize_name_tokens(value: &str) -> Vec<String> {
        value
            .split(|ch: char| !ch.is_alphanumeric())
            .map(|part| part.trim().to_ascii_lowercase())
            .filter(|part| !part.is_empty())
            .collect()
    }

    fn score_recipient_candidate(
        prompt_lower: &str,
        candidate: &str,
        active_agent_name: &str,
    ) -> i32 {
        let candidate_lower = candidate.trim().to_ascii_lowercase();
        if candidate_lower.is_empty() {
            return -1000;
        }
        let mut score = 0i32;

        if candidate_lower == active_agent_name.trim().to_ascii_lowercase() {
            score -= 100;
        }

        let candidate_tokens = normalize_name_tokens(&candidate_lower);
        if candidate_tokens.is_empty() {
            return score;
        }

        for token in &candidate_tokens {
            if prompt_lower.contains(&format!("to {}", token)) {
                score += 40;
            }
            if prompt_lower.contains(&format!("email {}", token)) {
                score += 25;
            }
            if prompt_lower.contains(&format!("message {}", token)) {
                score += 18;
            }
            if prompt_lower.contains(token) {
                score += 8;
            }
        }

        // "hey donna" style addressee should not become recipient for sends.
        if let Some(first_token) = candidate_tokens.first() {
            if prompt_lower.starts_with(&format!("hey {}", first_token))
                || prompt_lower.starts_with(&format!("hi {}", first_token))
            {
                score -= 30;
            }
        }

        score
    }

    fn detect_recipient_ref(
        context: &RunContext,
        ack_envelope: &AckEnvelope,
    ) -> String {
        let prompt_lower = context.prompt.to_ascii_lowercase();
        let mut best: Option<(i32, String)> = None;
        for entity in &ack_envelope.named_entities {
            let score = score_recipient_candidate(&prompt_lower, entity, &context.agent_name);
            match &best {
                Some((best_score, _)) if score <= *best_score => {}
                _ => best = Some((score, entity.clone())),
            }
        }
        if let Some((score, value)) = best {
            if score > -10 {
                return value;
            }
        }

        // fallback: parse simple "to <word>" pattern
        let tokens = prompt_lower
            .split_whitespace()
            .map(|value| value.trim_matches(|ch: char| !ch.is_alphanumeric()))
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        for window in tokens.windows(2) {
            if let [left, right] = window {
                if *left == "to" && *right != context.agent_name.to_ascii_lowercase() {
                    return right.to_string();
                }
            }
        }

        ack_envelope
            .named_entities
            .first()
            .cloned()
            .unwrap_or_default()
    }

    fn detect_method(prompt: &str, keywords: &[String]) -> &'static str {
        let mut combined = prompt.to_ascii_lowercase();
        if !keywords.is_empty() {
            combined.push(' ');
            combined.push_str(
                &keywords
                    .iter()
                    .map(|value| value.to_ascii_lowercase())
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
        if combined.contains("email") || combined.contains("mail") {
            "email"
        } else if combined.contains("sms") || combined.contains("text message") || combined.contains("text ") {
            "sms"
        } else if combined.contains("chat") || combined.contains("slack") || combined.contains("dm") {
            "chat"
        } else {
            "unknown"
        }
    }

    fn detect_folder(prompt: &str, keywords: &[String]) -> &'static str {
        let mut combined = prompt.to_ascii_lowercase();
        if !keywords.is_empty() {
            combined.push(' ');
            combined.push_str(
                &keywords
                    .iter()
                    .map(|value| value.to_ascii_lowercase())
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
        if combined.contains("sent") || combined.contains("outbox") {
            "sent"
        } else if combined.contains("draft") {
            "draft"
        } else if combined.contains("trash") {
            "trash"
        } else {
            "inbox"
        }
    }

    fn map_ack_to_prefetch_specs(context: &RunContext, ack_envelope: &AckEnvelope) -> Vec<PrefetchSpec> {
        let mut out = Vec::new();
        if ack_envelope.has_target_domain("comms") {
            let method = detect_method(&context.prompt, &ack_envelope.filter_keywords);
            let folder = detect_folder(&context.prompt, &ack_envelope.filter_keywords);
            let recipient_ref = detect_recipient_ref(context, ack_envelope);
            let recipient_ref_str = recipient_ref.as_str();
            let lower_intent = ack_envelope.primary_intent.to_ascii_lowercase();
            let intent = if lower_intent == "read" || lower_intent == "analyze" {
                "message_check"
            } else if lower_intent == "write" || lower_intent == "edit" {
                "message_send"
            } else {
                let lower_prompt = context.prompt.to_ascii_lowercase();
                if lower_prompt.contains("check") || lower_prompt.contains("inbox") || lower_prompt.contains("reply") {
                    "message_check"
                } else {
                    "message_send"
                }
            };
            let args = if intent == "message_check" {
                serde_json::json!({
                    "method": method,
                    "folder": folder,
                    "query": "",
                    "from_participant": "",
                    "to_participant": recipient_ref_str,
                    "subject_contains": "",
                    "state": ""
                })
            } else {
                serde_json::json!({
                    "method": method,
                    "recipient_ref": recipient_ref_str
                })
            };
            out.push(PrefetchSpec {
                tool: "comms_tool".to_string(),
                intent: Some(intent.to_string()),
                args,
            });
        }
        if ack_envelope.has_target_domain("org") {
            let lower_intent = ack_envelope.primary_intent.to_ascii_lowercase();
            if lower_intent == "write" || lower_intent == "edit" {
                out.push(PrefetchSpec {
                    tool: "org_manage_entities_v2".to_string(),
                    intent: Some("org_mutate_plan".to_string()),
                    args: serde_json::json!({}),
                });
            } else if let Some(entity) = ack_envelope.named_entities.first() {
                out.push(PrefetchSpec {
                    tool: "org_manage_entities_v2".to_string(),
                    intent: Some("org_read_operator".to_string()),
                    args: serde_json::json!({ "name_ref": entity }),
                });
            } else {
                out.push(PrefetchSpec {
                    tool: "org_manage_entities_v2".to_string(),
                    intent: Some("org_read_snapshot".to_string()),
                    args: serde_json::json!({}),
                });
            }
        }
        out
    }

    let mapped_prefetch_specs = map_ack_to_prefetch_specs(context, ack_envelope);
    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelStreamLine {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            line: format!(
                "{{\"type\":\"ack_prefetch_mapped\",\"target_domains\":{},\"intent\":\"{}\",\"spec_count\":{}}}",
                serde_json::to_string(&ack_envelope.target_domains).unwrap_or_else(|_| "[]".to_string()),
                ack_envelope.primary_intent,
                mapped_prefetch_specs.len()
            ),
        },
    );

    let mut prefetch_resolution = PrefetchResolution::empty();
    if !mapped_prefetch_specs.is_empty() {
        let Some(executor) = tool_executor.as_deref_mut() else {
            append_event(
                trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id: context.run_id.clone(),
                    error: RunError {
                        code: "prefetch_execution_unavailable".to_string(),
                        message: "Ack prefetch requested deterministic tool resolution, but no app tool executor is configured.".to_string(),
                        retryable: false,
                    },
                },
            );
            return Err(Some(trace_store.snapshot()));
        };
        prefetch_resolution = resolve_prefetch(
            &mapped_prefetch_specs,
            &context.allowed_tool_ids,
            executor,
        );
    }

    let mut prefetched_tool_details_sections = Vec::new();
    if !prefetch_resolution.detail_blocks.is_empty() {
        prefetched_tool_details_sections.push(prefetch_resolution.detail_blocks.join("\n\n"));
    }

    Ok(PrefetchGateOutput {
        prefetched_tool_details: prefetched_tool_details_sections.join("\n\n"),
        prefetch_resolution,
    })
}
