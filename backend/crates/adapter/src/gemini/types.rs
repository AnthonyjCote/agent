use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GeminiOutputFormat {
    Text,
    Json,
    StreamJson,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCapabilities {
    pub supports_stream_json: bool,
    pub supported_formats: Vec<GeminiOutputFormat>,
}
