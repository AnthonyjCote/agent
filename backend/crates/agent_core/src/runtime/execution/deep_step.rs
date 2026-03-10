use crate::{
    models::run::{RunError, RunEvent},
    ports::model_inference::ModelInferencePort,
    runtime::{
        context::run_context::RunContext,
        events::event_writer::append_event,
        tracing::memory_trace_store::MemoryTraceStore,
        prompt::prompt_builder::deep_prompt,
        streaming::inference_stream::{CollectedInference, infer_and_collect},
    },
    tools::toolbox_prefetch::PrefetchPacket,
};

pub(crate) fn run_deep_step<M: ModelInferencePort>(
    context: &RunContext,
    inference: &M,
    deep_phase: &str,
    step: usize,
    prefetched_tool_details: &str,
    prefetched_context_packets: &[PrefetchPacket],
    tool_results_log: &[String],
    work_log: &[String],
    requires_web_search: bool,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> Result<CollectedInference, RunError> {
    let deep_prompt_text = deep_prompt(
        &context.agent_name,
        &context.agent_role,
        &context.business_unit_name,
        &context.org_unit_name,
        &context.directive,
        &context.history_excerpt,
        &context.toolbox_summary,
        prefetched_tool_details,
        prefetched_context_packets,
        &context.org_compact_preload,
        tool_results_log,
        work_log,
        step,
        &context.prompt,
        requires_web_search,
    );
    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelRequest {
            run_id: context.run_id.clone(),
            phase: deep_phase.to_string(),
            payload: deep_prompt_text.clone(),
        },
    );
    let collected = infer_and_collect(
        inference,
        &context.workspace_id,
        &context.run_id,
        deep_phase,
        deep_phase,
        true,
        deep_prompt_text,
        on_event,
        trace_store,
    )?;
    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelResponse {
            run_id: context.run_id.clone(),
            phase: deep_phase.to_string(),
            payload: collected.text.clone(),
        },
    );
    Ok(collected)
}
