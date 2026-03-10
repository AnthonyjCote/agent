use crate::{
    models::run::{RunError, RunEvent},
    ports::model_inference::ModelInferencePort,
    runtime::{
        context::run_context::RunContext,
        events::event_writer::append_event,
        tracing::memory_trace_store::MemoryTraceStore,
        parsing::ack_decision_parser::{AckEnvelope, resolve_ack_envelope},
        prompt::prompt_builder::ack_prompt,
        streaming::inference_stream::infer_and_collect,
    },
};

pub(crate) fn run_ack_stage<M: ModelInferencePort>(
    context: &RunContext,
    inference: &M,
    on_event: &mut dyn FnMut(RunEvent),
    trace_store: &MemoryTraceStore,
) -> Result<AckEnvelope, RunError> {
    let ack_prompt_text = ack_prompt(
        &context.agent_name,
        &context.agent_role,
        &context.business_unit_name,
        &context.org_unit_name,
        &context.primary_objective,
        &context.history_excerpt,
        &context.toolbox_summary,
        &context.prompt,
    );
    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelRequest {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            payload: ack_prompt_text.clone(),
        },
    );

    let ack_output = infer_and_collect(
        inference,
        &context.workspace_id,
        &context.run_id,
        "ack_stage",
        "ack",
        false,
        ack_prompt_text,
        on_event,
        trace_store,
    )?
    .text;

    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelResponse {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            payload: ack_output.clone(),
        },
    );

    let envelope = resolve_ack_envelope(&ack_output, &context.allowed_tool_ids)?;
    append_event(
        trace_store,
        on_event,
        RunEvent::ModelDelta {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            text: envelope.ack_text.clone(),
        },
    );
    Ok(envelope)
}

