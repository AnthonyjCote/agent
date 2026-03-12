use crate::{
    models::{
        run::{RunError, RunEvent, RunRequest},
        tool::ToolOutputEnvelope,
    },
    ports::{
        model_inference::ModelInferencePort,
    },
    runtime::{
        context::run_context::RunContext,
        events::event_writer::append_event,
        execution::{
            ack_stage::run_ack_stage,
            deep_step::run_deep_step,
            finalize::finalize_with_text,
            prefetch_gate::{run_prefetch_gate, PrefetchGateOutput},
            tool_step::{ToolStepControl, execute_tool_calls_step, parse_model_tool_envelope},
        },
        logging::work_log::extract_reasoning_for_work_log,
        tracing::memory_trace_store::MemoryTraceStore,
        parsing::ack_decision_parser::AckDecision,
        prompt::prompt_builder::{
            FINAL_RESPONSE_SENTINEL,
        },
    },
};

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
    let context = RunContext::from_request(&request);

    let trace_store = MemoryTraceStore::new();
    append_event(
        &trace_store,
        on_event,
        RunEvent::RunStarted {
            workspace_id: context.workspace_id.clone(),
            run_id: context.run_id.clone(),
            thread_id: context.thread_id.clone(),
            policy_snapshot_version: "v1".to_string(),
            context_hash: "ctx_v1_placeholder".to_string(),
        },
    );

    let ack_envelope = match run_ack_stage(&context, inference, on_event, &trace_store) {
        Ok(value) => value,
        Err(error) => {
            if error.code == "run_cancelled" {
                append_event(
                    &trace_store,
                    on_event,
                    RunEvent::RunCancelled {
                        run_id: context.run_id.clone(),
                    },
                );
                return trace_store.snapshot();
            }
            append_event(
                &trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id: context.run_id.clone(),
                    error,
                },
            );
            return trace_store.snapshot();
        }
    };

    if ack_envelope.decision == AckDecision::AckOnly {
        return finalize_with_text(
            &context.run_id,
            &ack_envelope.ack_text,
            None,
            on_event,
            &trace_store,
        );
    }

    let deep_phase = ack_envelope
        .decision
        .deep_phase()
        .unwrap_or("deep_default")
        .to_string();
    let requires_web_search = ack_envelope.has_target_domain("websearch");
    let PrefetchGateOutput {
        prefetched_tool_details,
        prefetch_resolution,
    } = match run_prefetch_gate(
        &context,
        &ack_envelope,
        &mut tool_executor,
        on_event,
        &trace_store,
    ) {
        Ok(value) => value,
        Err(Some(events)) => return events,
        Err(None) => return trace_store.snapshot(),
    };
    let mut tool_results_log: Vec<String> = Vec::new();
    let mut work_log: Vec<String> = Vec::new();
    if !prefetch_resolution.work_log_entries.is_empty() {
        for entry in prefetch_resolution.work_log_entries {
            work_log.insert(0, entry);
        }
        if work_log.len() > 24 {
            work_log.truncate(24);
        }
    }

    let mut step: usize = 1;
    loop {
        let deep_collected = match run_deep_step(
            &context,
            inference,
            deep_phase.as_str(),
            step,
            &prefetched_tool_details,
            &prefetch_resolution.packets,
            &tool_results_log,
            &work_log,
            requires_web_search,
            on_event,
            &trace_store,
        ) {
            Ok(value) => value,
            Err(error) => {
                if error.code == "run_cancelled" {
                    append_event(
                        &trace_store,
                        on_event,
                        RunEvent::RunCancelled {
                            run_id: context.run_id.clone(),
                        },
                    );
                    return trace_store.snapshot();
                }
                append_event(
                    &trace_store,
                    on_event,
                    RunEvent::RunFailed {
                        run_id: context.run_id.clone(),
                        error,
                    },
                );
                return trace_store.snapshot();
            }
        };
        let deep_output = deep_collected.text.clone();
        let streamed_notes = extract_reasoning_for_work_log(
            &deep_collected.delta_chunks.join(""),
            FINAL_RESPONSE_SENTINEL,
        );
        if !streamed_notes.is_empty() {
            work_log.insert(0, format!("Step {} notes: {}", step, streamed_notes));
            if work_log.len() > 24 {
                work_log.truncate(24);
            }
        }

        let maybe_tool_envelope = parse_model_tool_envelope(&deep_output);
        let tool_calls = maybe_tool_envelope
            .as_ref()
            .map(|value| value.tool_calls.as_slice())
            .unwrap_or_default();

        if tool_calls.is_empty() {
            return finalize_with_text(
                &context.run_id,
                &deep_output,
                maybe_tool_envelope,
                on_event,
                &trace_store,
            );
        }
        let Some(executor) = tool_executor.as_deref_mut() else {
            append_event(
                &trace_store,
                on_event,
                RunEvent::RunFailed {
                    run_id: context.run_id.clone(),
                    error: RunError {
                        code: "tool_execution_unavailable".to_string(),
                        message: "Model requested app tool calls but no app tool executor is configured.".to_string(),
                        retryable: false,
                    },
                },
            );
            return trace_store.snapshot();
        };
        match execute_tool_calls_step(
            &context.run_id,
            step,
            tool_calls,
            &context.allowed_tool_ids,
            executor,
            &mut tool_results_log,
            &mut work_log,
            on_event,
            &trace_store,
        ) {
            ToolStepControl::Continue => {}
        }
        step = step.saturating_add(1);
    }
}
