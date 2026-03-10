use crate::{
    models::{
        run::{RunEvent, RunRequest},
        tool::ToolOutputEnvelope,
    },
    ports::model_inference::ModelInferencePort,
};

pub fn execute_run_once<M: ModelInferencePort>(
    request: RunRequest,
    inference: &M,
    on_event: &mut dyn FnMut(RunEvent),
) -> Vec<RunEvent> {
    super::execution::agent_run_executor::execute_run_once(request, inference, on_event)
}

pub fn execute_run_once_with_tools<M: ModelInferencePort>(
    request: RunRequest,
    inference: &M,
    on_event: &mut dyn FnMut(RunEvent),
    tool_executor: Option<
        &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, crate::models::run::RunError>,
    >,
) -> Vec<RunEvent> {
    super::execution::agent_run_executor::execute_run_once_with_tools(
        request,
        inference,
        on_event,
        tool_executor,
    )
}
