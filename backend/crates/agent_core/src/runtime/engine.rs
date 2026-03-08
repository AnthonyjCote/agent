use crate::{
    models::{
        blocks::MessageBlock,
        run::{RunError, RunEvent, RunRequest, RunUsage},
        side_effect::SideEffectLifecycleState,
        tool::ToolOutputEnvelope,
    },
    ports::{
        model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort},
        trace_store::TraceStorePort,
    },
    runtime::memory_trace_store::MemoryTraceStore,
    tools::{
        registry::execute_tool_by_id,
        toolbox::{
        allowed_tool_ids_from_metadata, render_tool_details, render_toolbox_summary,
        sanitize_requested_tool_ids,
        },
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
    requires_web_search: Option<bool>,
}

#[derive(Debug, Clone)]
struct AckEnvelope {
    decision: AckDecision,
    ack_text: String,
    prefetch_tools: Vec<String>,
    requires_web_search: bool,
}

#[derive(Debug, Deserialize)]
struct ModelToolEnvelope {
    #[serde(default)]
    tool_calls: Vec<ModelToolCall>,
    #[serde(default)]
    final_response: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelToolCall {
    tool: String,
    #[serde(default)]
    args: serde_json::Value,
}

struct CollectedInference {
    text: String,
    delta_chunks: Vec<String>,
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
    business_unit_name: &str,
    org_unit_name: &str,
    primary_objective: &str,
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
        "You are the acknowledgement router for agent {agent_name} ({agent_role}).\n\
Business unit: {business_unit_name}\n\
Org unit: {org_unit_name}\n\
Primary objective: {primary_objective}\n\
Current datetime: {now}\n\
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
- Critical policy:\n\
- You are not the deep worker. You are only the acknowledgement + routing layer.\n\
- Under no circumstance may you run tools, perform web search, or do substantive analysis.\n\
- Never output tool calls in ack stage.\n\
- Never refuse the user; route work to deep when needed.\n\
- Allowed `ack_only` cases: simple pleasantries/basic contextual chat, or one clarifying question.\n\
- For anything requiring research, tools, multi-step execution, current events, planning, or non-trivial analysis, choose handoff_deep_default.\n\
- Use handoff_deep_escalate only for clearly high-risk/high-complexity cases.\n\
- For handoff decisions, ack_text must be short progress acknowledgment only.\n\
- Tool expansion policy:\n\
- If the user request requires any app tool from toolbox summary, you must pre-expand it on handoff by listing its tool ID in `prefetch_tools`.\n\
- `prefetch_tools` is the explicit handoff mechanism used to provide expanded tool schema/instructions to deep stage.\n\
- Include every app tool that is likely required for first-pass execution, up to the cap.\n\
- Keep prefetch_tools small (max 5).\n\
- Set `requires_web_search` to true only when the request needs current external facts/news/market data.\n\
- Required JSON schema:\n\
{{\"decision\":\"ack_only|handoff_deep_default|handoff_deep_escalate\",\"ack_text\":\"short user-facing text\",\"prefetch_tools\":[\"tool_id\"],\"requires_web_search\":false}}"
    )
}

fn strip_final_response_sentinel(text: &str) -> String {
    text.replace(FINAL_RESPONSE_SENTINEL, "").trim().to_string()
}

fn deep_prompt(
    agent_name: &str,
    agent_role: &str,
    business_unit_name: &str,
    org_unit_name: &str,
    directive: &str,
    history_excerpt: &str,
    toolbox_summary: &str,
    prefetched_tool_details: &str,
    org_compact_preload: &str,
    tool_results_log: &[String],
    work_log: &[String],
    step_index: usize,
    user_prompt: &str,
    requires_web_search: bool,
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
    let tool_results_section = if tool_results_log.is_empty() {
        "App tool results: (none)\n".to_string()
    } else {
        format!(
            "App tool results (latest first):\n{}\n",
            tool_results_log.join("\n")
        )
    };
    let work_log_section = if work_log.is_empty() {
        "Run work log: (empty)\n".to_string()
    } else {
        format!("Run work log (latest first):\n{}\n", work_log.join("\n"))
    };
    let org_preload_section = if org_compact_preload.trim().is_empty() {
        "Org structure preload: (none)\n".to_string()
    } else {
        format!(
            "Org structure preload (name-based hierarchy):\n{}\n",
            org_compact_preload.trim()
        )
    };
    let web_rules = if requires_web_search {
        "- If web search is used for factual claims, include inline refs like [1], [2] beside those claims.\n\
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
".to_string()
    } else {
        String::new()
    };

    format!(
        "You are {agent_name}, acting as {agent_role}. This is step {step_index}.\n\
Business unit: {business_unit_name}\n\
Org unit: {org_unit_name}\n\
Current datetime: {now}\n\
Directive: {directive}\n\
{history_section}\
Toolbox summary (only these app tools are explicitly allowed):\n\
{toolbox_summary}\n\
{prefetch_section}\
{org_preload_section}\
{tool_results_section}\
{work_log_section}\
User prompt: {user_prompt}\n\n\
Runtime instructions:\n\
- You may use native model capabilities/tools (for example web search) when needed.\n\
- Think/work in normal language while solving the request.\n\
- To call app tools from the toolbox, output one JSON object at the end of your message with this exact shape:\n\
  {{\"tool_calls\":[{{\"tool\":\"tool_id\",\"args\":{{}}}}],\"final_response\":null}}\n\
- For app tool calls: keep reasoning short, keep tool_calls minimal, and only use tool IDs listed in toolbox summary.\n\
- Do not repeat the same tool call with the same args if prior app tool results already provide the needed data.\n\
- If prior app tool results are sufficient to answer, output {FINAL_RESPONSE_SENTINEL} and finalize instead of calling tools again.\n\
- Termination contract (critical):\n\
- After a successful mutating app tool call (create/update/delete/move/assign/set), re-evaluate remaining requested work.\n\
- If requested work is complete, do NOT call more tools; output {FINAL_RESPONSE_SENTINEL} and deliver the final user-facing result.\n\
- Never emit the same mutating app tool call again after a success unless the user explicitly asks to repeat it.\n\
- `final_response`: null is only valid when unresolved requested actions remain.\n\
- If all requested actions are satisfied, terminate the loop in the next response.\n\
- In your final response for creation/update workflows, confirm completion and include created/updated entity names and placement details from tool results.\n\
- Do not wrap tool call JSON in markdown fences.\n\
{web_rules}\
- Keep formatting minimal by default: prefer plain paragraphs and only use bullets/bold/numbering when they add clear readability value.\n\
- When you are ready to deliver the user-facing final answer, the FIRST token must be {FINAL_RESPONSE_SENTINEL}.\n\
- Do not emit {FINAL_RESPONSE_SENTINEL} until final answer.\n\
"
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
        let requires_web_search = parsed.requires_web_search.unwrap_or(false);
        Some(AckEnvelope {
            decision,
            ack_text,
            prefetch_tools: prefetch,
            requires_web_search,
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
            requires_web_search: false,
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

fn parse_model_tool_envelope(raw_output: &str) -> Option<ModelToolEnvelope> {
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

fn format_tool_result_for_prompt(tool_name: &str, output: &ToolOutputEnvelope) -> String {
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

fn format_debug_tool_output(output: &ToolOutputEnvelope) -> serde_json::Value {
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

fn format_tool_error_for_prompt(tool_name: &str, error: &RunError) -> String {
    format!(
        "Tool {} failed: [{}] {}. Adjust args and retry if needed.",
        tool_name, error.code, error.message
    )
}

fn compact_for_log(input: &str, max_len: usize) -> String {
    let compact = input.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() <= max_len {
        compact
    } else {
        format!("{}...", &compact[..max_len])
    }
}

fn extract_reasoning_for_work_log(text: &str) -> String {
    let mut value = text.to_string();
    if let Some(index) = value.find(FINAL_RESPONSE_SENTINEL) {
        value = value[..index].to_string();
    }
    if let Some(index) = value.find("{\"tool_calls\"") {
        value = value[..index].to_string();
    }
    compact_for_log(value.trim(), 700)
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
) -> Result<CollectedInference, RunError> {
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
    let text = if collected.trim().is_empty() && !streamed_parts.is_empty() {
        streamed_parts.join("")
    } else {
        collected
    };
    Ok(CollectedInference {
        text,
        delta_chunks: streamed_parts,
    })
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
    execute_run_once_with_tools(request, inference, on_event, None)
}

pub fn execute_run_once_with_tools<M: ModelInferencePort>(
    request: RunRequest,
    inference: &M,
    on_event: &mut dyn FnMut(RunEvent),
    mut tool_executor: Option<
        &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
    >,
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
    let business_unit_name = request
        .input
        .metadata
        .get("agent_business_unit_name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let org_unit_name = request
        .input
        .metadata
        .get("agent_org_unit_name")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let primary_objective = request
        .input
        .metadata
        .get("agent_primary_objective")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let directive = request.system_directive_short.clone();
    let org_compact_preload = request
        .input
        .metadata
        .get("org_compact_preload")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

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
        &business_unit_name,
        &org_unit_name,
        &primary_objective,
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
        Ok(value) => value.text,
        Err(error) => {
            append_event(
                &trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id: run_id.clone(),
                    error,
                },
            );
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
            append_event(
                &trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id: run_id.clone(),
                    error,
                },
            );
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
    let mut tool_results_log: Vec<String> = Vec::new();
    let mut work_log: Vec<String> = Vec::new();

    let mut step: usize = 1;
    loop {
        let deep_prompt_text = deep_prompt(
            &agent_name,
            &agent_role,
            &business_unit_name,
            &org_unit_name,
            &directive,
            &history_excerpt,
            &toolbox_summary,
            &prefetched_tool_details,
            &org_compact_preload,
            &tool_results_log,
            &work_log,
            step,
            &prompt,
            ack_envelope.requires_web_search,
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

        let deep_collected = match infer_and_collect(
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
                append_event(
                    &trace_store,
                    on_event,
                    RunEvent::RunFailed {
                        run_id: run_id.clone(),
                        error,
                    },
                );
                return trace_store.snapshot();
            }
        };
        let deep_output = deep_collected.text.clone();
        let streamed_notes = extract_reasoning_for_work_log(&deep_collected.delta_chunks.join(""));
        if !streamed_notes.is_empty() {
            work_log.insert(0, format!("Step {} notes: {}", step, streamed_notes));
            if work_log.len() > 24 {
                work_log.truncate(24);
            }
        }

        append_event(
            &trace_store,
            on_event,
            RunEvent::DebugModelResponse {
                run_id: run_id.clone(),
                phase: deep_phase.clone(),
                payload: deep_output.clone(),
            },
        );

        let maybe_tool_envelope = parse_model_tool_envelope(&deep_output);
        let tool_calls = maybe_tool_envelope
            .as_ref()
            .map(|value| value.tool_calls.as_slice())
            .unwrap_or_default();

        if tool_calls.is_empty() {
            let final_text = if let Some(marker_index) = deep_output.find(FINAL_RESPONSE_SENTINEL) {
                strip_final_response_sentinel(&deep_output[marker_index..])
            } else if let Some(envelope) = maybe_tool_envelope {
                envelope
                    .final_response
                    .unwrap_or_else(|| deep_output.trim().to_string())
                    .trim()
                    .to_string()
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

            return trace_store.snapshot();
        }

        let Some(executor) = tool_executor.as_deref_mut() else {
            append_event(
                &trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id,
                    error: RunError {
                        code: "tool_execution_unavailable".to_string(),
                        message: "Model requested app tool calls but no app tool executor is configured.".to_string(),
                        retryable: false,
                    },
                },
            );
            return trace_store.snapshot();
        };

        for (index, call) in tool_calls.iter().enumerate() {
            let call_id = format!("tool_{}_{}_{}", step, index + 1, call.tool);
            let call_args_preview = serde_json::to_string(&call.args).unwrap_or_else(|_| "{}".to_string());
            work_log.insert(
                0,
                format!(
                    "Step {} tool call: {} args={}",
                    step,
                    call.tool,
                    compact_for_log(&call_args_preview, 280)
                ),
            );
            if work_log.len() > 24 {
                work_log.truncate(24);
            }
            if !allowed_tool_ids.iter().any(|tool_id| tool_id == call.tool.as_str()) {
                append_event(
                    &trace_store,
                    on_event,
                    RunEvent::ToolResult {
                        run_id: run_id.clone(),
                        call_id: call_id.clone(),
                        tool_name: call.tool.clone(),
                        lifecycle: SideEffectLifecycleState::Failed,
                    },
                );
                let error = RunError {
                    code: "tool_not_allowed".to_string(),
                    message: format!("Tool is not allowed for this agent: {}", call.tool),
                    retryable: false,
                };
                append_event(
                    &trace_store,
                    on_event,
                    RunEvent::DebugToolResult {
                        run_id: run_id.clone(),
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
                &trace_store,
                on_event,
                RunEvent::ToolUse {
                    run_id: run_id.clone(),
                    call_id: call_id.clone(),
                    tool_name: call.tool.clone(),
                    lifecycle: SideEffectLifecycleState::Proposed,
                },
            );
            append_event(
                &trace_store,
                on_event,
                RunEvent::ToolUse {
                    run_id: run_id.clone(),
                    call_id: call_id.clone(),
                    tool_name: call.tool.clone(),
                    lifecycle: SideEffectLifecycleState::Dispatched,
                },
            );

            let tool_result = match execute_tool_by_id(&call.tool, &call.args) {
                Ok(Some(builtin)) => Ok(Some(builtin)),
                Ok(None) => executor(&call.tool, &call.args),
                Err(error) => Err(error),
            };
            match tool_result {
                Ok(Some(output)) => {
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::ToolResult {
                            run_id: run_id.clone(),
                            call_id: call_id.clone(),
                            tool_name: call.tool.clone(),
                            lifecycle: SideEffectLifecycleState::Completed,
                        },
                    );
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::DebugToolResult {
                            run_id: run_id.clone(),
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
                        &trace_store,
                        on_event,
                        RunEvent::ToolResult {
                            run_id: run_id.clone(),
                            call_id: call_id.clone(),
                            tool_name: call.tool.clone(),
                            lifecycle: SideEffectLifecycleState::Failed,
                        },
                    );
                    let error = RunError {
                        code: "tool_not_implemented".to_string(),
                        message: format!("Tool is not implemented: {}", call.tool),
                        retryable: false,
                    };
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::DebugToolResult {
                            run_id: run_id.clone(),
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
                Err(error) => {
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::ToolResult {
                            run_id: run_id.clone(),
                            call_id: call_id.clone(),
                            tool_name: call.tool.clone(),
                            lifecycle: SideEffectLifecycleState::Failed,
                        },
                    );
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::DebugToolResult {
                            run_id: run_id.clone(),
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
            }
        }
        step = step.saturating_add(1);
    }
}
