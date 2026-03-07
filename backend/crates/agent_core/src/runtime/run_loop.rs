use crate::{
    models::{run::{RunEvent, RunRequest, RunStatus}, side_effect::SideEffectLifecycleState},
    ports::{model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort}, trace_store::TraceStorePort},
};

pub struct RunLoop<'a, M: ModelInferencePort, T: TraceStorePort> {
    inference: &'a M,
    trace_store: &'a T,
    status: RunStatus,
}

impl<'a, M: ModelInferencePort, T: TraceStorePort> RunLoop<'a, M, T> {
    pub fn new(inference: &'a M, trace_store: &'a T) -> Self {
        Self {
            inference,
            trace_store,
            status: RunStatus::Running,
        }
    }

    pub fn status(&self) -> RunStatus {
        self.status
    }

    pub fn execute(&mut self, request: RunRequest) {
        self.trace_store.append(RunEvent::RunStarted {
            workspace_id: request.workspace_id.clone(),
            run_id: request.run_id.clone(),
            thread_id: request.thread_id.clone(),
            policy_snapshot_version: "v1".to_string(),
            context_hash: "ctx_v1_placeholder".to_string(),
        });

        let infer_req = InferenceRequest {
            workspace_id: request.workspace_id,
            run_id: request.run_id.clone(),
            prompt: format!("{} -> {}", request.input.sender, request.input.recipient),
            model_profile: None,
        };

        match self.inference.infer(infer_req) {
            Ok(events) => {
                for event in events {
                    match event {
                        InferenceEvent::Delta(text) => {
                            self.trace_store.append(RunEvent::ModelDelta {
                                run_id: request.run_id.clone(),
                                phase: "legacy".to_string(),
                                text,
                            });
                        }
                        InferenceEvent::DebugRawLine(_) => {}
                        InferenceEvent::Blocks(blocks) => {
                            self.trace_store
                                .append(RunEvent::BlocksProduced { run_id: request.run_id.clone(), blocks });
                        }
                        InferenceEvent::Completed => {
                            self.trace_store.append(RunEvent::ToolResult {
                                run_id: request.run_id.clone(),
                                call_id: "none".to_string(),
                                tool_name: "none".to_string(),
                                lifecycle: SideEffectLifecycleState::Acknowledged,
                            });
                        }
                    }
                }

                self.status = RunStatus::Completed;
                self.trace_store.append(RunEvent::RunCompleted {
                    run_id: request.run_id,
                    usage: None,
                });
            }
            Err(error) => {
                self.status = RunStatus::Failed;
                self.trace_store.append(RunEvent::RunFailed {
                    run_id: request.run_id,
                    error,
                });
            }
        }
    }
}
