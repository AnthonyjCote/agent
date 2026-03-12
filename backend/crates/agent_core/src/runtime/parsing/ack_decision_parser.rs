use serde::Deserialize;

use crate::models::run::RunError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AckDecision {
    AckOnly,
    HandoffDeepDefault,
    HandoffDeepEscalate,
}

impl AckDecision {
    pub(crate) fn deep_phase(self) -> Option<&'static str> {
        match self {
            AckDecision::AckOnly => None,
            AckDecision::HandoffDeepDefault => Some("deep_default"),
            AckDecision::HandoffDeepEscalate => Some("deep_escalate"),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct AckEnvelopeRaw {
    decision: Option<String>,
    ack_text: Option<String>,
    #[serde(default)]
    target_domains: Vec<String>,
    primary_intent: Option<String>,
    #[serde(default)]
    named_entities: Vec<String>,
    #[serde(default)]
    filter_keywords: Vec<String>,
    #[serde(default)]
    relative_dates: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct AckEnvelope {
    pub decision: AckDecision,
    pub ack_text: String,
    pub target_domains: Vec<String>,
    pub primary_intent: String,
    pub named_entities: Vec<String>,
    pub filter_keywords: Vec<String>,
    pub relative_dates: Vec<String>,
}

impl AckEnvelope {
    pub fn has_target_domain(&self, value: &str) -> bool {
        self.target_domains
            .iter()
            .any(|entry| entry.eq_ignore_ascii_case(value))
    }
}

fn decision_from_text(value: &str) -> Option<AckDecision> {
    match value.trim().to_ascii_lowercase().as_str() {
        "ack_only" => Some(AckDecision::AckOnly),
        "handoff_deep_default" => Some(AckDecision::HandoffDeepDefault),
        "handoff_deep_escalate" => Some(AckDecision::HandoffDeepEscalate),
        _ => None,
    }
}

fn normalize_json_candidate(candidate: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return None;
    }
    let unfenced = if trimmed.starts_with("```") {
        let mut lines = trimmed.lines();
        let _ = lines.next();
        let mut body = lines.collect::<Vec<_>>();
        if body
            .last()
            .map(|line| line.trim_start().starts_with("```"))
            == Some(true)
        {
            body.pop();
        }
        body.join("\n")
    } else {
        trimmed.to_string()
    };
    let start = unfenced.find('{')?;
    let end = unfenced.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(unfenced[start..=end].to_string())
}

fn normalize_csv(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn normalize_target_domains(values: Vec<String>) -> Vec<String> {
    const ALLOWED: &[&str] = &["comms", "org", "calendar", "tasks", "websearch"];
    let mut out = Vec::new();
    for value in values {
        let normalized = value.trim().to_ascii_lowercase();
        if normalized.is_empty() {
            continue;
        }
        if ALLOWED.contains(&normalized.as_str()) && !out.iter().any(|entry| entry == &normalized) {
            out.push(normalized);
        }
    }
    out
}

fn normalize_primary_intent(value: Option<String>) -> String {
    let raw = value
        .map(|item| item.trim().to_ascii_lowercase())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    match raw.as_str() {
        "read" | "write" | "edit" | "analyze" | "mixed" | "unknown" => raw,
        _ => "unknown".to_string(),
    }
}

fn parse_candidate(candidate: &str) -> Option<AckEnvelope> {
    let normalized = normalize_json_candidate(candidate)?;
    let parsed: AckEnvelopeRaw = serde_json::from_str(&normalized).ok()?;
    let decision = decision_from_text(parsed.decision.as_deref().unwrap_or(""))?;
    let ack_text = parsed.ack_text.unwrap_or_default().trim().to_string();
    if ack_text.is_empty() {
        return None;
    }
    Some(AckEnvelope {
        decision,
        ack_text,
        target_domains: normalize_target_domains(parsed.target_domains),
        primary_intent: normalize_primary_intent(parsed.primary_intent),
        named_entities: normalize_csv(parsed.named_entities),
        filter_keywords: normalize_csv(parsed.filter_keywords),
        relative_dates: normalize_csv(parsed.relative_dates),
    })
}

fn parse_ack_envelope(raw: &str) -> Option<AckEnvelope> {
    let trimmed = raw.trim();
    if let Some(envelope) = parse_candidate(trimmed) {
        return Some(envelope);
    }
    for (index, ch) in trimmed.char_indices().rev() {
        if ch != '{' {
            continue;
        }
        if let Some(envelope) = parse_candidate(&trimmed[index..]) {
            return Some(envelope);
        }
    }
    None
}

pub(crate) fn resolve_ack_envelope(
    raw_ack_output: &str,
    _allowed_tool_ids: &[String],
) -> Result<AckEnvelope, RunError> {
    if let Some(envelope) = parse_ack_envelope(raw_ack_output) {
        return Ok(envelope);
    }

    let trimmed = raw_ack_output.trim();
    let preview = trimmed.chars().take(220).collect::<String>();
    Err(RunError {
        code: "ack_envelope_invalid".to_string(),
        message: if preview.is_empty() {
            "Ack stage returned empty output; expected strict JSON routing envelope.".to_string()
        } else {
            format!(
                "Ack stage returned invalid routing envelope; expected strict JSON. Output preview: {}",
                preview
            )
        },
        retryable: false,
    })
}
