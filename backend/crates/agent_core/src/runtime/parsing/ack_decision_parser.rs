use serde::Deserialize;

use crate::{
    models::run::RunError,
    runtime::logging::work_log::compact_for_log,
    tools::{
        toolbox::sanitize_requested_tool_ids,
        toolbox_prefetch::{PrefetchSpec, PrefetchSpecRaw},
    },
};

const ACK_PREFETCH_MAX: usize = 5;

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
struct AckEnvelopeRaw {
    decision: Option<String>,
    ack_text: Option<String>,
    prefetch_tools: Option<Vec<AckPrefetchEntryRaw>>,
    requires_web_search: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AckPrefetchEntryRaw {
    ToolId(String),
    ToolSpec(PrefetchSpecRaw),
}

#[derive(Debug, Clone)]
pub(crate) struct AckEnvelope {
    pub decision: AckDecision,
    pub ack_text: String,
    pub prefetch_tools: Vec<String>,
    pub prefetch_specs: Vec<PrefetchSpec>,
    pub requires_web_search: bool,
}

fn decision_from_text(value: &str) -> Option<AckDecision> {
    match value.trim().to_ascii_lowercase().as_str() {
        "ack_only" => Some(AckDecision::AckOnly),
        "handoff_deep_default" => Some(AckDecision::HandoffDeepDefault),
        "handoff_deep_escalate" => Some(AckDecision::HandoffDeepEscalate),
        _ => None,
    }
}

fn parse_ack_envelope(raw: &str, allowed_tool_ids: &[String]) -> Option<AckEnvelope> {
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

    fn parse_candidate(candidate: &str, allowed_tool_ids: &[String]) -> Option<AckEnvelope> {
        let normalized = normalize_json_candidate(candidate)?;
        let parsed: AckEnvelopeRaw = serde_json::from_str(&normalized).ok()?;
        let decision = decision_from_text(parsed.decision.as_deref().unwrap_or(""))?;
        let ack_text = parsed.ack_text.unwrap_or_default().trim().to_string();
        if ack_text.is_empty() {
            return None;
        }
        let mut requested_tool_ids = Vec::new();
        let mut requested_specs = Vec::new();
        for entry in parsed.prefetch_tools.unwrap_or_default() {
            match entry {
                AckPrefetchEntryRaw::ToolId(tool_id) => {
                    requested_tool_ids.push(tool_id);
                }
                AckPrefetchEntryRaw::ToolSpec(spec) => {
                    requested_tool_ids.push(spec.tool.clone());
                    requested_specs.push(PrefetchSpec {
                        tool: spec.tool,
                        intent: spec.intent.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
                        args: spec.args.unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
                    });
                }
            }
        }
        let mut prefetch = sanitize_requested_tool_ids(&requested_tool_ids, allowed_tool_ids);
        if prefetch.len() > ACK_PREFETCH_MAX {
            prefetch.truncate(ACK_PREFETCH_MAX);
        }
        let prefetch_set = prefetch.iter().map(String::as_str).collect::<std::collections::HashSet<_>>();
        let mut dedupe_spec_keys = std::collections::HashSet::new();
        let mut prefetch_specs = requested_specs
            .into_iter()
            .filter(|spec| prefetch_set.contains(spec.tool.as_str()))
            .filter(|spec| {
                let key = format!(
                    "{}|{}|{}",
                    spec.tool,
                    spec.intent.clone().unwrap_or_default(),
                    compact_for_log(&spec.args.to_string(), 320)
                );
                dedupe_spec_keys.insert(key)
            })
            .collect::<Vec<_>>();
        if prefetch_specs.len() > ACK_PREFETCH_MAX {
            prefetch_specs.truncate(ACK_PREFETCH_MAX);
        }
        let requires_web_search = parsed.requires_web_search.unwrap_or(false);
        Some(AckEnvelope {
            decision,
            ack_text,
            prefetch_tools: prefetch,
            prefetch_specs,
            requires_web_search,
        })
    }

    let trimmed = raw.trim();
    if let Some(envelope) = parse_candidate(trimmed, allowed_tool_ids) {
        return Some(envelope);
    }

    for (index, ch) in trimmed.char_indices().rev() {
        if ch != '{' {
            continue;
        }
        if let Some(envelope) = parse_candidate(&trimmed[index..], allowed_tool_ids) {
            return Some(envelope);
        }
    }

    None
}

pub(crate) fn resolve_ack_envelope(
    raw_ack_output: &str,
    allowed_tool_ids: &[String],
) -> Result<AckEnvelope, RunError> {
    if let Some(envelope) = parse_ack_envelope(raw_ack_output, allowed_tool_ids) {
        return Ok(envelope);
    }

    let trimmed = raw_ack_output.trim();
    if !trimmed.is_empty() && !trimmed.contains('{') {
        return Ok(AckEnvelope {
            decision: AckDecision::AckOnly,
            ack_text: trimmed.to_string(),
            prefetch_tools: Vec::new(),
            prefetch_specs: Vec::new(),
            requires_web_search: false,
        });
    }

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
