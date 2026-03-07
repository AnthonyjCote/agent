use crate::models::{blocks::MessageBlock, run::RunError};

#[derive(Debug, Clone)]
pub struct InferenceRequest {
    pub workspace_id: String,
    pub run_id: String,
    pub prompt: String,
}

#[derive(Debug, Clone)]
pub enum InferenceEvent {
    Delta(String),
    DebugRawLine(String),
    Blocks(Vec<MessageBlock>),
    Completed,
}

pub trait ModelInferencePort {
    fn health(&self) -> Result<(), RunError>;
    fn infer(&self, request: InferenceRequest) -> Result<Vec<InferenceEvent>, RunError>;
    fn infer_stream(
        &self,
        request: InferenceRequest,
        on_event: &mut dyn FnMut(InferenceEvent),
    ) -> Result<Vec<InferenceEvent>, RunError> {
        let events = self.infer(request)?;
        for event in events.iter().cloned() {
            on_event(event);
        }
        Ok(events)
    }
}
