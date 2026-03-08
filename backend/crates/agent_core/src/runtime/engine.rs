use crate::{
    models::{
        blocks::MessageBlock,
        run::{RunError, RunEvent, RunRequest, RunUsage},
    },
    ports::{
        model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort},
        trace_store::TraceStorePort,
    },
    runtime::memory_trace_store::MemoryTraceStore,
    tools::toolbox::{
        allowed_tool_ids_from_metadata, render_tool_details, render_toolbox_summary,
        sanitize_requested_tool_ids,
    },
};
use chrono::Local;
use serde::Deserialize;

const FINAL_RESPONSE_SENTINEL: &str = "[[FINAL_RESPONSE]]";
const ACK_PREFETCH_MAX: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AckDecision {
    AckOnly,
    HandoffDeepDefault,
    HandoffDeepEscalate,
}

impl AckDecision {
    fn deep_phase(self) -> Option<&'static str> {
        match self {
            AckDecision::AckOnly => None,
            AckDecision::HandoffDeepDefault => Some("deep_default"),
            AckDecision::HandoffDeepEscalate => Some("deep_escalate"),
        }
    }
}

#[derive(Debug, Deserialize)]
struct AckEnvelopeRaw {
    decision: Option<String>,
    ack_text: Option<String>,
    prefetch_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct AckEnvelope {
    decision: AckDecision,
    ack_text: String,
    prefetch_tools: Vec<String>,
}

fn collect_text(events: &[InferenceEvent]) -> String {
    let mut parts = Vec::new();

    for event in events {
        match event {
            InferenceEvent::Delta(text) if !text.trim().is_empty() => parts.push(text.to_string()),
            InferenceEvent::Blocks(blocks) => {
                for block in blocks {
                    if let MessageBlock::AssistantText { text } = block {
                        if !text.trim().is_empty() {
                            parts.push(text.to_string());
                        }
                    }
                }
            }
            InferenceEvent::Completed => {}
            InferenceEvent::DebugRawLine(_) => {}
            InferenceEvent::Delta(_) => {}
        }
    }

    parts.join("")
}

fn ack_prompt(
    agent_name: &str,
    agent_role: &str,
    directive: &str,
    history_excerpt: &str,
    toolbox_summary: &str,
    user_prompt: &str,
) -> String {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string();
    let history_section = if history_excerpt.trim().is_empty() {
        "Conversation history: (empty)\n".to_string()
    } else {
        format!(
            "Conversation history (oldest -> newest, truncated):\n{}\n",
            history_excerpt.trim()
        )
    };

    format!(
        "You are {agent_name}, acting as {agent_role}. You are in fast-ack stage.\n\
Current datetime: {now}\n\
Directive: {directive}\n\
{history_section}\
Toolbox summary (only these app tools are explicitly allowed):\n\
{toolbox_summary}\n\
User prompt: {user_prompt}\n\n\
Runtime instructions:\n\
- Decide route and return strict JSON only. No markdown, no prose outside JSON.\n\
- Do NOT wrap JSON in markdown fences/backticks.\n\
- Decision options:\n\
  - ack_only\n\
  - handoff_deep_default\n\
  - handoff_deep_escalate\n\
- Routing behavior (critical):\n\
- Your job is to route and acknowledge, not to refuse tasks.\n\
- Never return a refusal in ack_text.\n\
- Do not run tools, do not perform web searches, and do not attempt deep analysis in ack stage.\n\
- If the task requires tools, web search, or substantive research, provide a brief helpful acknowledgment and choose handoff_deep_default or handoff_deep_escalate.\n\
- If a request requires current events, news, market updates, projections, external research, or tool use, choose a handoff decision (usually handoff_deep_default; use handoff_deep_escalate only when complexity/risk is clearly high).\n\
- If the request is simple social chat, use ack_only.\n\
- If the request is ambiguous, ask one clarification question with ack_only.\n\
- ack_text must be a short progress-oriented acknowledgment when handing off.\n\
- Do not claim lack of capability in ack_text; routing exists specifically so deep stage can perform the work.\n\
- If prompt is ambiguous/underspecified, ask exactly one clarification question in ack_text and use ack_only.\n\
- If prompt is trivial/social, use ack_only with a short conversational ack.\n\
- If prompt requires meaningful analysis/research/multi-step work, use a handoff decision.\n\
- You may set prefetch_tools to likely-needed app tool IDs from toolbox summary.\n\
- Keep prefetch_tools small (max 5).\n\
- Required JSON schema:\n\
{{\"decision\":\"ack_only|handoff_deep_default|handoff_deep_escalate\",\"ack_text\":\"short user-facing text\",\"prefetch_tools\":[\"tool_id\"]}}"
    )
}

fn strip_final_response_sentinel(text: &str) -> String {
    text.replace(FINAL_RESPONSE_SENTINEL, "").trim().to_string()
}

fn deep_prompt(
    agent_name: &str,
    agent_role: &str,
    directive: &str,
    history_excerpt: &str,
    toolbox_summary: &str,
    prefetched_tool_details: &str,
    user_prompt: &str,
) -> String {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string();
    let history_section = if history_excerpt.trim().is_empty() {
        "Conversation history: (empty)\n".to_string()
    } else {
        format!(
            "Conversation history (oldest -> newest, truncated):\n{}\n",
            history_excerpt.trim()
        )
    };
    let prefetch_section = if prefetched_tool_details.trim().is_empty() {
        "Prefetched tool details: (none)\n".to_string()
    } else {
        format!(
            "Prefetched tool details:\n{}\n",
            prefetched_tool_details.trim()
        )
    };

    format!(
        "You are {agent_name}, acting as {agent_role}.\n\
Current datetime: {now}\n\
Directive: {directive}\n\
{history_section}\
Toolbox summary (only these app tools are explicitly allowed):\n\
{toolbox_summary}\n\
{prefetch_section}\
User prompt: {user_prompt}\n\n\
Runtime instructions:\n\
- You may use native model capabilities/tools (for example web search) when needed.\n\
- Think/work in normal language while solving the request.\n\
- If web search is used for factual claims, include inline refs like [1], [2] beside those claims.\n\
- If web search is used, append a final `Sources:` section.\n\
- If you output a table, use valid markdown table format:\n\
  - one header line\n\
  - one separator line using dashes (for example `|---|---|`)\n\
  - one row per line\n\
- Do not output flattened single-line tables.\n\
- Do not put citation refs inside table cells.\n\
- Put citations for table-derived claims in short bullet notes immediately below the table, then include full entries in `Sources:`.\n\
- The heading must be plain text exactly `Sources:` (no markdown, no bold, no backticks).\n\
- Put `Sources:` on its own line, followed by one source per line.\n\
- Query quality: prefer specific, measurable queries with concrete entities, metrics, dates, and regions.\n\
- Query quality: avoid vague terms alone; pair them with measurable proxies and constraints.\n\
- Query quality: run a broad query first, then 1-3 narrowing follow-up queries only when evidence gaps remain.\n\
- Each source line MUST use this exact format:\n\
  [1] Full Page Title | https://source-home-url | https://raw-grounding-uri\n\
- `Full Page Title` must be human-readable title text (best available page/article title, or a close approximation inferred from page content).\n\
- Never use a URL in `Full Page Title`.\n\
- Never use plain domain-only text in `Full Page Title` (for example `example.com`) when a descriptive title can be inferred.\n\
- `https://source-home-url` must be the canonical site/home URL (for example https://example.com).\n\
- The raw grounding URI must be the exact unedited grounding URL returned by search.\n\
- Never clean, shorten, decode, resolve, or rewrite grounding URLs.\n\
- Do not include `Sources:` if no web grounding was used.\n\
- Do not fabricate citations or URLs.\n\
- Keep formatting minimal by default: prefer plain paragraphs and only use bullets/bold/numbering when they add clear readability value.\n\
- When you are ready to deliver the user-facing final answer, the FIRST token must be {FINAL_RESPONSE_SENTINEL}.\n\
- Do not emit {FINAL_RESPONSE_SENTINEL} until final answer.\n\
- Final answer should be concise and directly useful."
    )
}

fn decision_from_text(value: &str) -> Option<AckDecision> {
    match value.trim().to_ascii_lowercase().as_str() {
        "ack_only" => Some(AckDecision::AckOnly),
        "handoff_deep_default" => Some(AckDecision::HandoffDeepDefault),
        "handoff_deep_escalate" => Some(AckDecision::HandoffDeepEscalate),
        _ => None,
    }
}

fn parse_ack_envelope(raw: &str, allowed_tool_ids: &[String]) -> Option<AckEnvelope> {
    fn normalize_json_candidate(candidate: &str) -> Option<String> {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            return None;
        }
        let unfenced = if trimmed.starts_with("```") {
            let mut lines = trimmed.lines();
            let _ = lines.next();
            let mut body = lines.collect::<Vec<_>>();
            if body
                .last()
                .map(|line| line.trim_start().starts_with("```"))
                == Some(true)
            {
                body.pop();
            }
            body.join("\n")
        } else {
            trimmed.to_string()
        };
        let start = unfenced.find('{')?;
        let end = unfenced.rfind('}')?;
        if end <= start {
            return None;
        }
        Some(unfenced[start..=end].to_string())
    }

    fn parse_candidate(candidate: &str, allowed_tool_ids: &[String]) -> Option<AckEnvelope> {
        let normalized = normalize_json_candidate(candidate)?;
        let parsed: AckEnvelopeRaw = serde_json::from_str(&normalized).ok()?;
        let decision = decision_from_text(parsed.decision.as_deref().unwrap_or(""))?;
        let ack_text = parsed.ack_text.unwrap_or_default().trim().to_string();
        if ack_text.is_empty() {
            return None;
        }
        let requested = parsed.prefetch_tools.unwrap_or_default();
        let mut prefetch = sanitize_requested_tool_ids(&requested, allowed_tool_ids);
        if prefetch.len() > ACK_PREFETCH_MAX {
            prefetch.truncate(ACK_PREFETCH_MAX);
        }
        Some(AckEnvelope {
            decision,
            ack_text,
            prefetch_tools: prefetch,
        })
    }

    let trimmed = raw.trim();
    if let Some(envelope) = parse_candidate(trimmed, allowed_tool_ids) {
        return Some(envelope);
    }

    for (index, ch) in trimmed.char_indices().rev() {
        if ch != '{' {
            continue;
        }
        if let Some(envelope) = parse_candidate(&trimmed[index..], allowed_tool_ids) {
            return Some(envelope);
        }
    }

    None
}

fn resolve_ack_envelope(raw_ack_output: &str, allowed_tool_ids: &[String]) -> Result<AckEnvelope, RunError> {
    if let Some(envelope) = parse_ack_envelope(raw_ack_output, allowed_tool_ids) {
        return Ok(envelope);
    }

    let trimmed = raw_ack_output.trim();
    if !trimmed.is_empty() && !trimmed.contains('{') {
        return Ok(AckEnvelope {
            decision: AckDecision::AckOnly,
            ack_text: trimmed.to_string(),
            prefetch_tools: Vec::new(),
        });
    }

    let preview = trimmed.chars().take(220).collect::<String>();
    Err(RunError {
        code: "ack_envelope_invalid".to_string(),
        message: if preview.is_empty() {
            "Ack stage returned empty output; expected strict JSON routing envelope.".to_string()
        } else {
            format!(
                "Ack stage returned invalid routing envelope; expected strict JSON. Output preview: {}",
                preview
            )
        },
        retryable: false,
    })
}

fn infer_and_collect<M: ModelInferencePort>(
    inference: &M,
    workspace_id: &str,
    run_id: &str,
    phase: &str,
    model_profile: &str,
    emit_model_deltas: bool,
    prompt: String,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> Result<String, RunError> {
    let mut streamed_parts = Vec::new();
    let mut on_inference_event = |event: InferenceEvent| {
        if let InferenceEvent::Delta(text) = event {
            if text.trim().is_empty() {
                return;
            }
            let chunk = text.to_string();
            streamed_parts.push(chunk.clone());
            if emit_model_deltas {
                append_event(
                    trace_store,
                    on_event,
                    RunEvent::ModelDelta {
                        run_id: run_id.to_string(),
                        phase: phase.to_string(),
                        text: chunk,
                    },
                );
            }
            return;
        }

        if let InferenceEvent::DebugRawLine(line) = event {
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() {
                return;
            }
            append_event(
                trace_store,
                on_event,
                RunEvent::DebugModelStreamLine {
                    run_id: run_id.to_string(),
                    phase: phase.to_string(),
                    line: trimmed,
                },
            );
        }
    };

    let events = inference.infer_stream(
        InferenceRequest {
            workspace_id: workspace_id.to_string(),
            run_id: run_id.to_string(),
            prompt,
            model_profile: Some(model_profile.to_string()),
        },
        &mut on_inference_event,
    )?;

    let collected = collect_text(&events);
    if collected.trim().is_empty() && !streamed_parts.is_empty() {
        Ok(streamed_parts.join(""))
    } else {
        Ok(collected)
    }
}

fn append_event(
    trace_store: &MemoryTraceStore,
    on_event: &mut dyn FnMut(RunEvent),
    event: RunEvent,
) {
    on_event(event.clone());
    trace_store.append(event);
}

pub fn execute_run_once<M: ModelInferencePort>(
    request: RunRequest,
    inference: &M,
    on_event: &mut dyn FnMut(RunEvent),
) -> Vec<RunEvent> {
    let run_id = request.run_id.clone();
    let workspace_id = request.workspace_id.clone();
    let thread_id = request.thread_id.clone();
    let prompt = request
        .input
        .metadata
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let history_excerpt = request
        .input
        .metadata
        .get("history_excerpt")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let allowed_tool_ids = allowed_tool_ids_from_metadata(&request.input.metadata);
    let toolbox_summary = render_toolbox_summary(&allowed_tool_ids);
    let agent_name = request.agent_name.clone();
    let agent_role = request.agent_role.clone();
    let directive = request.system_directive_short.clone();

    let trace_store = MemoryTraceStore::new();
    append_event(
        &trace_store,
        on_event,
        RunEvent::RunStarted {
            workspace_id: workspace_id.clone(),
            run_id: run_id.clone(),
            thread_id: thread_id.clone(),
            policy_snapshot_version: "v1".to_string(),
            context_hash: "ctx_v1_placeholder".to_string(),
        },
    );

    let ack_prompt_text = ack_prompt(
        &agent_name,
        &agent_role,
        &directive,
        &history_excerpt,
        &toolbox_summary,
        &prompt,
    );
    append_event(
        &trace_store,
        on_event,
        RunEvent::DebugModelRequest {
            run_id: run_id.clone(),
            phase: "ack_stage".to_string(),
            payload: ack_prompt_text.clone(),
        },
    );

    let ack_output = match infer_and_collect(
        inference,
        &workspace_id,
        &run_id,
        "ack_stage",
        "ack",
        false,
        ack_prompt_text,
        on_event,
        &trace_store,
    ) {
        Ok(value) => value,
        Err(error) => {
            append_event(&trace_store, on_event, RunEvent::RunFailed { run_id, error });
            return trace_store.snapshot();
        }
    };

    append_event(
        &trace_store,
        on_event,
        RunEvent::DebugModelResponse {
            run_id: run_id.clone(),
            phase: "ack_stage".to_string(),
            payload: ack_output.clone(),
        },
    );

    let ack_envelope = match resolve_ack_envelope(&ack_output, &allowed_tool_ids) {
        Ok(value) => value,
        Err(error) => {
            append_event(&trace_store, on_event, RunEvent::RunFailed { run_id, error });
            return trace_store.snapshot();
        }
    };
    append_event(
        &trace_store,
        on_event,
        RunEvent::ModelDelta {
            run_id: run_id.clone(),
            phase: "ack_stage".to_string(),
            text: ack_envelope.ack_text.clone(),
        },
    );

    if ack_envelope.decision == AckDecision::AckOnly {
        append_event(
            &trace_store,
            on_event,
            RunEvent::BlocksProduced {
                run_id: run_id.clone(),
                blocks: vec![MessageBlock::AssistantText {
                    text: ack_envelope.ack_text,
                }],
            },
        );
        append_event(
            &trace_store,
            on_event,
            RunEvent::RunCompleted {
                run_id,
                usage: Some(RunUsage {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    pruned_tokens: 0,
                    latency_ms: 0,
                }),
            },
        );
        return trace_store.snapshot();
    }

    let deep_phase = ack_envelope
        .decision
        .deep_phase()
        .unwrap_or("deep_default")
        .to_string();
    let prefetched_tool_details = render_tool_details(&ack_envelope.prefetch_tools, &allowed_tool_ids);
    let deep_prompt_text = deep_prompt(
        &agent_name,
        &agent_role,
        &directive,
        &history_excerpt,
        &toolbox_summary,
        &prefetched_tool_details,
        &prompt,
    );
    append_event(
        &trace_store,
        on_event,
        RunEvent::DebugModelRequest {
            run_id: run_id.clone(),
            phase: deep_phase.clone(),
            payload: deep_prompt_text.clone(),
        },
    );

    let deep_output = match infer_and_collect(
        inference,
        &workspace_id,
        &run_id,
        deep_phase.as_str(),
        deep_phase.as_str(),
        true,
        deep_prompt_text,
        on_event,
        &trace_store,
    ) {
        Ok(value) => value,
        Err(error) => {
            append_event(&trace_store, on_event, RunEvent::RunFailed { run_id, error });
            return trace_store.snapshot();
        }
    };

    append_event(
        &trace_store,
        on_event,
        RunEvent::DebugModelResponse {
            run_id: run_id.clone(),
            phase: deep_phase,
            payload: deep_output.clone(),
        },
    );

    let final_text = if let Some(marker_index) = deep_output.find(FINAL_RESPONSE_SENTINEL) {
        strip_final_response_sentinel(&deep_output[marker_index..])
    } else {
        deep_output.trim().to_string()
    };

    append_event(
        &trace_store,
        on_event,
        RunEvent::BlocksProduced {
            run_id: run_id.clone(),
            blocks: vec![MessageBlock::AssistantText { text: final_text }],
        },
    );
    append_event(
        &trace_store,
        on_event,
        RunEvent::RunCompleted {
            run_id,
            usage: Some(RunUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                pruned_tokens: 0,
                latency_ms: 0,
            }),
        },
    );

    trace_store.snapshot()
}
