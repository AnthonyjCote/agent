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
    tools::toolbox::{allowed_tool_ids_from_metadata, render_toolbox_summary},
};

const FINAL_RESPONSE_SENTINEL: &str = "[[FINAL_RESPONSE]]";

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

fn agent_prompt(
    agent_name: &str,
    agent_role: &str,
    directive: &str,
    history_excerpt: &str,
    toolbox_summary: &str,
    user_prompt: &str,
) -> String {
    let history_section = if history_excerpt.trim().is_empty() {
        "Conversation history: (empty)\n".to_string()
    } else {
        format!(
            "Conversation history (oldest -> newest, truncated):\n{}\n",
            history_excerpt.trim()
        )
    };

    format!(
        "You are {agent_name}, acting as {agent_role}.\n\
Directive: {directive}\n\
{history_section}\
Toolbox summary (only these app tools are explicitly allowed):\n\
{toolbox_summary}\n\
User prompt: {user_prompt}\n\n\
Runtime instructions:\n\
- You may use native model capabilities/tools (for example web search) when needed.\n\
- Think/work in normal language while solving the request.\n\
- If web search is used for factual claims, include inline refs like [1], [2] beside those claims.\n\
- If web search is used, append a final `Sources:` section.\n\
- The heading must be plain text exactly `Sources:` (no markdown, no bold, no backticks).\n\
- Put `Sources:` on its own line, followed by one source per line.\n\
- Query quality: prefer specific, measurable queries with concrete entities, metrics, dates, and regions.\n\
- Query quality: avoid vague terms alone; pair them with measurable proxies and constraints.\n\
- Query quality: run a broad query first, then 1-3 narrowing follow-up queries only when evidence gaps remain.\n\
- Each source line MUST use this exact format:\n\
  [1] Full Page Title | https://source-home-url | https://raw-grounding-uri\n\
- `Full Page Title` should be the best available article/page title, or a close approximation inferred from the page content when exact title is unavailable; do not use only the domain name unless no better title signal exists.\n\
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

fn strip_final_response_sentinel(text: &str) -> String {
    text.replace(FINAL_RESPONSE_SENTINEL, "").trim().to_string()
}

fn infer_and_collect<M: ModelInferencePort>(
    inference: &M,
    workspace_id: &str,
    run_id: &str,
    phase: &str,
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
            append_event(
                trace_store,
                on_event,
                RunEvent::ModelDelta {
                    run_id: run_id.to_string(),
                    phase: phase.to_string(),
                    text: chunk,
                },
            );
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

    let prompt_text = agent_prompt(
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
            phase: "agent_loop".to_string(),
            payload: prompt_text.clone(),
        },
    );

    let output = match infer_and_collect(
        inference,
        &workspace_id,
        &run_id,
        "agent_loop",
        prompt_text,
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
            phase: "agent_loop".to_string(),
            payload: output.clone(),
        },
    );

    let final_text = if let Some(marker_index) = output.find(FINAL_RESPONSE_SENTINEL) {
        strip_final_response_sentinel(&output[marker_index..])
    } else {
        output.trim().to_string()
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
