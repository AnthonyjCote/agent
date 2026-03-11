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

fn looks_like_ack_tool_use(lines: &[String]) -> bool {
    lines.iter().any(|line| {
        let compact = line.trim();
        compact.contains("\"type\":\"tool_use\"")
            || compact.contains("\"tool_calls\"")
            || compact.contains("\"type\":\"tool_result\"")
    })
}

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

    let mut ack_collected = infer_and_collect(
        inference,
        &context.workspace_id,
        &context.run_id,
        "ack_stage",
        "ack",
        false,
        ack_prompt_text.clone(),
        on_event,
        trace_store,
    )?;

    if looks_like_ack_tool_use(&ack_collected.debug_lines) {
        append_event(
            trace_store,
            on_event,
            RunEvent::DebugModelStreamLine {
                run_id: context.run_id.clone(),
                phase: "ack_stage".to_string(),
                line: "{\"type\":\"ack_decision_invalid\",\"reason\":\"ack_tool_use_detected_retrying\"}".to_string(),
            },
        );
        let corrective = format!(
            "{}\n\nCorrection:\n- Your previous output attempted tool execution.\n- This is forbidden in ack stage.\n- Return ONLY one strict JSON decision object. No tools, no prose, no markdown.",
            ack_prompt_text
        );
        ack_collected = infer_and_collect(
            inference,
            &context.workspace_id,
            &context.run_id,
            "ack_stage",
            "ack",
            false,
            corrective,
            on_event,
            trace_store,
        )?;
    }
    let ack_output = ack_collected.text;

    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelResponse {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            payload: ack_output.clone(),
        },
    );

    let envelope = match resolve_ack_envelope(&ack_output, &context.allowed_tool_ids) {
        Ok(value) => value,
        Err(_) => {
            append_event(
                trace_store,
                on_event,
                RunEvent::DebugModelStreamLine {
                    run_id: context.run_id.clone(),
                    phase: "ack_stage".to_string(),
                    line: "{\"type\":\"ack_decision_invalid\",\"reason\":\"invalid_json_envelope_retrying\"}".to_string(),
                },
            );
            let corrective = format!(
                "{}\n\nCorrection:\n- Return ONLY one strict JSON object matching the required schema.\n- No prose, markdown, code fences, or tool calls.",
                ack_prompt_text
            );
            let retry = infer_and_collect(
                inference,
                &context.workspace_id,
                &context.run_id,
                "ack_stage",
                "ack",
                false,
                corrective,
                on_event,
                trace_store,
            )?;
            resolve_ack_envelope(&retry.text, &context.allowed_tool_ids)?
        }
    };
    append_event(
        trace_store,
        on_event,
        RunEvent::DebugModelStreamLine {
            run_id: context.run_id.clone(),
            phase: "ack_stage".to_string(),
            line: format!(
                "{{\"type\":\"ack_decision_parsed\",\"decision\":\"{}\",\"prefetch_count\":{},\"requires_web_search\":{}}}",
                match envelope.decision {
                    crate::runtime::parsing::ack_decision_parser::AckDecision::AckOnly => "ack_only",
                    crate::runtime::parsing::ack_decision_parser::AckDecision::HandoffDeepDefault => "handoff_deep_default",
                    crate::runtime::parsing::ack_decision_parser::AckDecision::HandoffDeepEscalate => "handoff_deep_escalate",
                },
                envelope.prefetch_specs.len(),
                envelope.requires_web_search
            ),
        },
    );
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
