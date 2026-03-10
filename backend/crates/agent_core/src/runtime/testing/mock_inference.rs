use crate::{
    models::{
        blocks::MessageBlock,
        run::{RunError},
    },
    ports::model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort},
};

#[derive(Debug, Default)]
pub struct MockInferenceAdapter;

impl ModelInferencePort for MockInferenceAdapter {
    fn health(&self) -> Result<(), RunError> {
        Ok(())
    }

    fn infer(&self, request: InferenceRequest) -> Result<Vec<InferenceEvent>, RunError> {
        Ok(vec![
            InferenceEvent::Delta("Processing request...".to_string()),
            InferenceEvent::Blocks(vec![MessageBlock::AssistantText {
                text: format!(
                    "Runtime response placeholder for run {} in workspace {}.",
                    request.run_id, request.workspace_id
                ),
            }]),
            InferenceEvent::Completed,
        ])
    }
}
