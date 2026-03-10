use crate::{
    models::{
        blocks::MessageBlock,
        run::{RunEvent, RunUsage},
    },
    runtime::{
        events::event_writer::append_event,
        tracing::memory_trace_store::MemoryTraceStore,
        prompt::prompt_builder::{FINAL_RESPONSE_SENTINEL, strip_final_response_sentinel},
        execution::tool_step::ModelToolEnvelope,
    },
};

pub(crate) fn finalize_with_text(
    run_id: &str,
    deep_output: &str,
    maybe_tool_envelope: Option<ModelToolEnvelope>,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> Vec<RunEvent> {
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
        trace_store,
        on_event,
        RunEvent::BlocksProduced {
            run_id: run_id.to_string(),
            blocks: vec![MessageBlock::AssistantText { text: final_text }],
        },
    );
    append_event(
        trace_store,
        on_event,
        RunEvent::RunCompleted {
            run_id: run_id.to_string(),
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
