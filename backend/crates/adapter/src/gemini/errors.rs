use agent_core::models::run::RunError;

pub fn missing_cli_error() -> RunError {
    RunError {
        code: "gemini_missing_cli".to_string(),
        message: "Gemini CLI not found on PATH".to_string(),
        retryable: false,
    }
}
