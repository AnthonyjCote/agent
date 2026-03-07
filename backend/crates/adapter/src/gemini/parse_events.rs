use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GeminiStreamEvent {
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub delta: Option<bool>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

pub fn parse_jsonl_line(line: &str) -> Option<GeminiStreamEvent> {
    serde_json::from_str::<GeminiStreamEvent>(line).ok()
}

fn push_chunk(out: &mut Vec<String>, text: &str) {
    if text.is_empty() || looks_like_runtime_prompt(text) {
        return;
    }
    out.push(text.to_string());
}

fn event_type(event: &GeminiStreamEvent) -> &str {
    event.r#type.as_deref().or(event.event.as_deref()).unwrap_or("")
}

fn looks_like_runtime_prompt(text: &str) -> bool {
    if text.starts_with("{\"needs_tool_details\"") {
        return true;
    }
    let markers = [
        "You are the planning module for agent",
        "Return strict JSON only",
        "Toolbox summary",
        "Conversation history",
        "Expanded tool details",
        "User prompt:",
        "Schema:",
        "Rules:",
    ];
    let hits = markers.iter().filter(|marker| text.contains(**marker)).count();
    hits >= 2
}

pub fn extract_text_chunks(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return out;
    }

    if let Some(event) = parse_jsonl_line(trimmed) {
        let kind = event_type(&event);

        // Primary headless stream-json contract from Gemini CLI.
        if kind == "message" && event.role.as_deref() == Some("assistant") {
            if let Some(content) = event.content.as_deref() {
                push_chunk(&mut out, content);
                return out;
            }
        }
        // Backward-compatible fallback for alternate emitter shapes.
        if let Some(text) = event.text.as_deref() {
            push_chunk(&mut out, text);
        } else if let Some(content) = event.content.as_deref() {
            push_chunk(&mut out, content);
        }
    }

    out
}
