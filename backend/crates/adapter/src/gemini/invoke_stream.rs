use std::process::Command;

use super::types::GeminiOutputFormat;

#[derive(Debug, Clone)]
pub struct GeminiInvokeRequest {
    pub model: Option<String>,
    pub prompt: String,
    pub output_format: GeminiOutputFormat,
}

pub fn build_headless_command(request: &GeminiInvokeRequest) -> Command {
    let mut command = Command::new("gemini");
    command.arg("-p").arg(&request.prompt);

    if let Some(model) = &request.model {
        command.arg("--model").arg(model);
    }

    let format_arg = match request.output_format {
        GeminiOutputFormat::Text => "text",
        GeminiOutputFormat::Json => "json",
        GeminiOutputFormat::StreamJson => "stream-json",
    };

    command.arg("--output-format").arg(format_arg);
    command
}
