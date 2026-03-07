use std::{
    io::{BufRead, BufReader},
    process::Stdio,
};

use agent_core::{
    models::{blocks::MessageBlock, run::RunError},
    ports::model_inference::{InferenceEvent, InferenceRequest, ModelInferencePort},
};

use super::{
    invoke_stream::{build_headless_command, GeminiInvokeRequest},
    parse_events::extract_text_chunks,
    types::GeminiOutputFormat,
    workspace::{ensure_workspace_context, AGENT_DECK_GEMINI_MODEL_ALIAS},
};

#[derive(Debug, Default)]
pub struct GeminiCliModelInference;

fn default_model_name() -> Option<String> {
    let configured = std::env::var("AGENT_DECK_GEMINI_MODEL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if configured.is_some() {
        return configured;
    }
    Some(AGENT_DECK_GEMINI_MODEL_ALIAS.to_string())
}

impl ModelInferencePort for GeminiCliModelInference {
    fn health(&self) -> Result<(), RunError> {
        Ok(())
    }

    fn infer(&self, request: InferenceRequest) -> Result<Vec<InferenceEvent>, RunError> {
        let invoke = GeminiInvokeRequest {
            model: default_model_name(),
            prompt: request.prompt,
            output_format: GeminiOutputFormat::Text,
        };
        let workspace_dir = ensure_workspace_context()?;

        let output = build_headless_command(&invoke)
            .current_dir(&workspace_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| RunError {
                code: "gemini_infer_spawn_failed".to_string(),
                message: format!("Failed to spawn Gemini CLI: {error}"),
                retryable: true,
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(RunError {
                code: "gemini_infer_failed".to_string(),
                message: if stderr.is_empty() {
                    format!("Gemini CLI failed with status {}", output.status)
                } else {
                    format!("Gemini CLI failed: {stderr}")
                },
                retryable: false,
            });
        }

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

        Ok(vec![
            InferenceEvent::Blocks(vec![MessageBlock::AssistantText { text }]),
            InferenceEvent::Completed,
        ])
    }

    fn infer_stream(
        &self,
        request: InferenceRequest,
        on_event: &mut dyn FnMut(InferenceEvent),
    ) -> Result<Vec<InferenceEvent>, RunError> {
        let fallback_request = request.clone();
        let invoke = GeminiInvokeRequest {
            model: default_model_name(),
            prompt: request.prompt,
            output_format: GeminiOutputFormat::StreamJson,
        };
        let workspace_dir = ensure_workspace_context()?;

        let mut child = build_headless_command(&invoke)
            .current_dir(&workspace_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| RunError {
                code: "gemini_stream_spawn_failed".to_string(),
                message: format!("Failed to spawn Gemini CLI: {error}"),
                retryable: true,
            })?;

        let stdout = child.stdout.take().ok_or_else(|| RunError {
            code: "gemini_stream_stdout_missing".to_string(),
            message: "Gemini CLI stdout was not captured".to_string(),
            retryable: false,
        })?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let mut chunks = Vec::new();
        let mut streamed_any = false;

        loop {
            line.clear();
            let read = reader.read_line(&mut line).map_err(|error| RunError {
                code: "gemini_stream_read_failed".to_string(),
                message: format!("Failed reading Gemini stream: {error}"),
                retryable: true,
            })?;
            if read == 0 {
                break;
            }
            let raw_line = line.trim().to_string();
            if !raw_line.is_empty() {
                on_event(InferenceEvent::DebugRawLine(raw_line.clone()));
            }

            for chunk in extract_text_chunks(&raw_line) {
                streamed_any = true;
                chunks.push(chunk.clone());
                on_event(InferenceEvent::Delta(chunk));
            }
        }

        let output = child.wait_with_output().map_err(|error| RunError {
            code: "gemini_stream_wait_failed".to_string(),
            message: format!("Failed waiting on Gemini CLI: {error}"),
            retryable: true,
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(RunError {
                code: "gemini_stream_failed".to_string(),
                message: if stderr.is_empty() {
                    format!("Gemini CLI failed with status {}", output.status)
                } else {
                    format!("Gemini CLI failed: {stderr}")
                },
                retryable: false,
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        for raw in stderr.lines().map(str::trim).filter(|line| !line.is_empty()) {
            on_event(InferenceEvent::DebugRawLine(format!("stderr: {raw}")));
        }

        if !streamed_any {
            return self.infer(fallback_request);
        }

        let text = chunks.join("");
        let events = vec![
            InferenceEvent::Blocks(vec![MessageBlock::AssistantText { text }]),
            InferenceEvent::Completed,
        ];
        for event in events.iter().cloned() {
            on_event(event);
        }
        Ok(events)
    }
}
