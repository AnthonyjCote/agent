use crate::{
    models::{blocks::MessageBlock, run::RunError, run::RunEvent},
    ports::model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort},
};

use crate::runtime::{events::event_writer::append_event, tracing::memory_trace_store::MemoryTraceStore};

pub(crate) struct CollectedInference {
    pub text: String,
    pub delta_chunks: Vec<String>,
    pub debug_lines: Vec<String>,
}

fn find_tool_envelope_start(text: &str) -> Option<usize> {
    let tool_calls_key_index = text.find("\"tool_calls\"")?;
    text[..=tool_calls_key_index].rfind('{')
}

fn visible_delta_prefix(text: &str) -> &str {
    if let Some(start) = find_tool_envelope_start(text) {
        &text[..start]
    } else {
        text
    }
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

pub(crate) fn infer_and_collect<M: ModelInferencePort>(
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
    let mut streamed_parts_raw = Vec::new();
    let mut streamed_parts_visible = Vec::new();
    let mut debug_lines = Vec::new();
    let mut stream_accumulator = String::new();
    let mut emitted_visible_len = 0usize;
    let mut on_inference_event = |event: InferenceEvent| {
        if let InferenceEvent::Delta(text) = event {
            if text.trim().is_empty() {
                return;
            }
            let chunk = text.to_string();
            streamed_parts_raw.push(chunk.clone());
            stream_accumulator.push_str(&chunk);

            let visible_all = visible_delta_prefix(&stream_accumulator);
            if visible_all.len() > emitted_visible_len {
                let delta_visible = visible_all[emitted_visible_len..].to_string();
                if !delta_visible.trim().is_empty() {
                    streamed_parts_visible.push(delta_visible.clone());
                    if emit_model_deltas {
                        append_event(
                            trace_store,
                            on_event,
                            RunEvent::ModelDelta {
                                run_id: run_id.to_string(),
                                phase: phase.to_string(),
                                text: delta_visible,
                            },
                        );
                    }
                }
                emitted_visible_len = visible_all.len();
            }

            return;
        }

        if let InferenceEvent::DebugRawLine(line) = event {
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() {
                return;
            }
            if phase == "ack_stage"
                && (trimmed.contains("\"type\":\"tool_use\"")
                    || trimmed.contains("\"type\":\"tool_result\""))
            {
                return;
            }
            debug_lines.push(trimmed.clone());
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
    let text = if collected.trim().is_empty() && !streamed_parts_raw.is_empty() {
        streamed_parts_raw.join("")
    } else {
        collected
    };
    Ok(CollectedInference {
        text,
        delta_chunks: streamed_parts_visible,
        debug_lines,
    })
}
