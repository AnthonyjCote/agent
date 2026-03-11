use crate::{
    models::{run::{RunError, RunEvent}, tool::ToolOutputEnvelope},
    runtime::{
        context::run_context::RunContext,
        events::event_writer::append_event,
        tracing::memory_trace_store::MemoryTraceStore,
        parsing::ack_decision_parser::AckEnvelope,
    },
    tools::{
        toolbox::render_tool_details,
        toolbox_prefetch::{PrefetchResolution, resolve_prefetch},
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
    let mut prefetch_resolution = PrefetchResolution::empty();
    if !ack_envelope.prefetch_specs.is_empty() {
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
            &ack_envelope.prefetch_specs,
            &context.allowed_tool_ids,
            executor,
        );
    }

    let mut static_prefetch_tool_ids = ack_envelope.prefetch_tools.clone();
    if ack_envelope
        .prefetch_specs
        .iter()
        .any(|spec| spec.tool == "comms_tool")
    {
        static_prefetch_tool_ids.retain(|tool_id| tool_id != "comms_tool");
    }
    if prefetch_resolution
        .requested_tool_ids
        .iter()
        .any(|tool_id| tool_id == "comms_tool")
    {
        static_prefetch_tool_ids.retain(|tool_id| tool_id != "comms_tool");
    }
    let mut prefetched_tool_details_sections = Vec::new();
    let static_details = render_tool_details(&static_prefetch_tool_ids, &context.allowed_tool_ids);
    if !static_details.trim().is_empty() {
        prefetched_tool_details_sections.push(static_details);
    }
    if !prefetch_resolution.detail_blocks.is_empty() {
        prefetched_tool_details_sections.push(prefetch_resolution.detail_blocks.join("\n\n"));
    }

    Ok(PrefetchGateOutput {
        prefetched_tool_details: prefetched_tool_details_sections.join("\n\n"),
        prefetch_resolution,
    })
}
