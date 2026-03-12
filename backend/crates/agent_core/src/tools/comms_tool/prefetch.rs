use std::collections::HashMap;

use crate::{
    models::{run::RunError, tool::ToolOutputEnvelope},
    tools::registry::execute_tool_by_id,
};

#[derive(Debug, Clone)]
pub struct DirectoryOperator {
    pub name: String,
    pub title: String,
}

#[derive(Debug, Clone)]
pub struct DirectoryAccount {
    pub channel: String,
    pub address: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageMethod {
    Email,
    Sms,
    Chat,
}

impl MessageMethod {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "email" => Some(Self::Email),
            "sms" => Some(Self::Sms),
            "chat" => Some(Self::Chat),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            MessageMethod::Email => "email",
            MessageMethod::Sms => "sms",
            MessageMethod::Chat => "chat",
        }
    }

    pub fn field_label(&self) -> &'static str {
        match self {
            MessageMethod::Email => "email",
            MessageMethod::Sms => "phone",
            MessageMethod::Chat => "chat_handle",
        }
    }

    pub fn send_args_hint(&self) -> &'static str {
        match self {
            MessageMethod::Email => "{\"ops\":[{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"channel\":\"email\",\"direction\":\"outbound\",\"toParticipants\":[\"<recipient_email>\"],\"subject\":\"<subject>\",\"bodyText\":\"<body>\"}}]}",
            MessageMethod::Sms => "{\"ops\":[{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"channel\":\"sms\",\"direction\":\"outbound\",\"toParticipants\":[\"<recipient_phone>\"],\"bodyText\":\"<body>\"}}]}",
            MessageMethod::Chat => "{\"ops\":[{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"channel\":\"chat\",\"direction\":\"outbound\",\"toParticipants\":[\"<recipient_chat>\"],\"bodyText\":\"<body>\"}}]}",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedRecipient {
    pub name: String,
    pub title: String,
    pub destination: String,
}

#[derive(Debug, Clone)]
pub struct CommsPrefetchResult {
    pub method: MessageMethod,
    pub recipient_ref: String,
    pub candidates: Vec<ResolvedRecipient>,
    pub clarification_question: Option<String>,
    pub operator_directory_raw: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CandidateThread {
    pub thread_id: String,
    pub subject: String,
    pub from: String,
    pub state: String,
    pub last_message_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct MessageCheckPrefetchResult {
    pub method: MessageMethod,
    pub folder: String,
    pub query: String,
    pub candidates: Vec<CandidateThread>,
    pub recommended_thread_id: Option<String>,
    pub prefetched_messages: Vec<serde_json::Value>,
}

fn parse_directory_operators_from_org_output(output: &ToolOutputEnvelope) -> Vec<DirectoryOperator> {
    let mut out = Vec::new();
    let Some(structured) = output.structured_data.as_ref() else {
        return out;
    };

    let maybe_index = structured
        .get("snapshot")
        .and_then(|value| value.get("operatorIndex"))
        .and_then(|value| value.as_array())
        .cloned()
        .or_else(|| {
            structured
                .get("data")
                .and_then(|value| value.as_array())
                .and_then(|items| {
                    items.iter().find_map(|item| {
                        let target = item.get("target").and_then(|value| value.as_str()).unwrap_or("");
                        if target != "snapshot" {
                            return None;
                        }
                        item.get("data")
                            .and_then(|value| value.get("operatorIndex"))
                            .and_then(|value| value.as_array())
                            .cloned()
                    })
                })
        });

    if let Some(items) = maybe_index {
        for item in items {
            let name = item
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() {
                continue;
            }
            let title = item
                .get("title")
                .and_then(|value| value.as_str())
                .unwrap_or("Operator")
                .trim()
                .to_string();
            out.push(DirectoryOperator { name, title });
        }
    }

    out
}

fn parse_directory_accounts_from_comms_output(output: &ToolOutputEnvelope) -> Vec<DirectoryAccount> {
    let mut out = Vec::new();
    let Some(structured) = output.structured_data.as_ref() else {
        return out;
    };
    let Some(data_items) = structured.get("data").and_then(|value| value.as_array()) else {
        return out;
    };
    for item in data_items {
        let Some(accounts) = item.get("accounts").and_then(|value| value.as_array()) else {
            continue;
        };
        for account in accounts {
            let channel = account
                .get("channel")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let address = account
                .get("address")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let display_name = account
                .get("displayName")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if channel.is_empty() || display_name.is_empty() {
                continue;
            }
            out.push(DirectoryAccount {
                channel,
                address,
                display_name,
            });
        }
    }
    out
}

fn parse_operator_directory_from_comms_output(output: &ToolOutputEnvelope) -> Vec<ResolvedRecipient> {
    let mut out = Vec::new();
    let Some(structured) = output.structured_data.as_ref() else {
        return out;
    };
    let Some(data_items) = structured.get("data").and_then(|value| value.as_array()) else {
        return out;
    };
    for item in data_items {
        let Some(matches) = item.get("matches").and_then(|value| value.as_array()) else {
            continue;
        };
        for value in matches {
            let name = value
                .get("name")
                .and_then(|raw| raw.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let title = value
                .get("title")
                .and_then(|raw| raw.as_str())
                .unwrap_or("Operator")
                .trim()
                .to_string();
            let destination = value
                .get("address")
                .and_then(|raw| raw.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() || destination.is_empty() {
                continue;
            }
            out.push(ResolvedRecipient {
                name,
                title,
                destination,
            });
        }
    }
    out
}

fn run_tool_call_for_prefetch(
    tool_name: &str,
    args: &serde_json::Value,
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> Result<Option<ToolOutputEnvelope>, RunError> {
    match execute_tool_by_id(tool_name, args) {
        Ok(Some(output)) => Ok(Some(output)),
        Ok(None) => executor(tool_name, args),
        Err(error) => Err(error),
    }
}

fn parse_threads_from_comms_output(output: &ToolOutputEnvelope) -> Vec<CandidateThread> {
    let mut out = Vec::new();
    let Some(structured) = output.structured_data.as_ref() else {
        return out;
    };
    let Some(data_items) = structured.get("data").and_then(|value| value.as_array()) else {
        return out;
    };
    for item in data_items {
        let Some(threads) = item.get("threads").and_then(|value| value.as_array()) else {
            continue;
        };
        for thread in threads {
            let thread_id = thread
                .get("threadId")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if thread_id.is_empty() {
                continue;
            }
            let subject = thread
                .get("subject")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let from = thread
                .get("participants")
                .and_then(|value| value.get("from"))
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let state = thread
                .get("state")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let last_message_at_ms = thread
                .get("lastMessageAtMs")
                .and_then(|value| value.as_i64())
                .unwrap_or_default();
            out.push(CandidateThread {
                thread_id,
                subject,
                from,
                state,
                last_message_at_ms,
            });
        }
    }
    out
}

fn parse_messages_from_comms_output(output: &ToolOutputEnvelope) -> Vec<serde_json::Value> {
    let Some(structured) = output.structured_data.as_ref() else {
        return Vec::new();
    };
    let Some(data_items) = structured.get("data").and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    for item in data_items {
        if let Some(messages) = item.get("messages").and_then(|value| value.as_array()) {
            return messages.clone();
        }
    }
    Vec::new()
}

pub fn resolve_message_send_prefetch_from_tools(
    method: MessageMethod,
    recipient_ref: &str,
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> CommsPrefetchResult {
    fn normalize_for_match(value: &str) -> String {
        value
            .trim()
            .to_ascii_lowercase()
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || ch.is_ascii_whitespace() || *ch == '.' || *ch == '_' || *ch == '-')
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn destination_local_part(destination: &str) -> String {
        destination
            .split('@')
            .next()
            .unwrap_or(destination)
            .trim()
            .to_ascii_lowercase()
    }

    fn score_recipient_match(recipient_ref: &str, candidate: &ResolvedRecipient) -> i32 {
        let ref_norm = normalize_for_match(recipient_ref);
        if ref_norm.is_empty() {
            return 0;
        }

        let name_norm = normalize_for_match(&candidate.name);
        let title_norm = normalize_for_match(&candidate.title);
        let local_part = destination_local_part(&candidate.destination);

        if name_norm == ref_norm {
            return 220;
        }

        // Strong name token match: "bob" -> "Bob Robertson"
        if name_norm
            .split_whitespace()
            .any(|token| token == ref_norm || token.starts_with(&ref_norm))
        {
            return 180;
        }

        if name_norm.contains(&ref_norm) {
            return 140;
        }

        if local_part == ref_norm
            || local_part.starts_with(&format!("{ref_norm}."))
            || local_part.contains(&format!(".{ref_norm}"))
            || local_part.starts_with(&ref_norm)
        {
            return 125;
        }

        // Title fallback ("chief of staff"), lower confidence than name.
        if title_norm.contains(&ref_norm) {
            return 85;
        }

        0
    }

    let recipient_query = recipient_ref.trim();
    let comms_directory_args = serde_json::json!({
        "ops": [
            {
                "action": "read",
                "target": "operator_directory",
                "selector": {
                    "channel": method.as_str(),
                    // Query-first lookup keeps short refs (e.g. "bob") flexible across
                    // name/title/address, while still allowing deterministic resolution.
                    "query": if recipient_query.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(recipient_query.to_string()) },
                    "name": serde_json::Value::Null,
                    "title": serde_json::Value::Null,
                    "limit": 8
                }
            }
        ]
    });

    let (candidates, operator_directory_raw) = run_tool_call_for_prefetch("comms_tool", &comms_directory_args, executor)
        .ok()
        .and_then(|value| value)
        .map(|value| {
            let parsed = parse_operator_directory_from_comms_output(&value);
            let raw = serde_json::json!({
                "summary": value.summary,
                "structuredData": value.structured_data,
                "errors": value.errors,
                "artifacts": value.artifacts
            });
            (parsed, Some(raw))
        })
        .unwrap_or_else(|| (Vec::new(), None));

    let mut ranked = candidates
        .into_iter()
        .filter_map(|candidate| {
            let score = score_recipient_match(recipient_query, &candidate);
            if score <= 0 {
                return None;
            }
            Some((score, candidate))
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.cmp(&b.1.name)));

    let mut deduped = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for (_, candidate) in ranked {
        let key = format!(
            "{}|{}",
            candidate.name.trim().to_ascii_lowercase(),
            candidate.destination.trim().to_ascii_lowercase()
        );
        if !seen.insert(key) {
            continue;
        }
        deduped.push(candidate);
        if deduped.len() >= 5 {
            break;
        }
    }

    CommsPrefetchResult {
        method,
        recipient_ref: recipient_ref.trim().to_string(),
        candidates: deduped,
        clarification_question: None,
        operator_directory_raw,
    }
}

pub fn resolve_message_check_prefetch_from_tools(
    method: MessageMethod,
    folder: &str,
    query: &str,
    from_participant: Option<&str>,
    to_participant: Option<&str>,
    subject_contains: Option<&str>,
    state: Option<&str>,
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> MessageCheckPrefetchResult {
    let read_threads_args = serde_json::json!({
        "ops": [
            {
                "action": "read",
                "target": "threads",
                "selector": {
                    "channel": method.as_str(),
                    "folder": folder,
                    "search": if query.trim().is_empty() { serde_json::Value::Null } else { serde_json::Value::String(query.trim().to_string()) },
                    "fromParticipant": from_participant,
                    "toParticipant": to_participant,
                    "subjectContains": subject_contains,
                    "state": state,
                    "limit": 20
                }
            }
        ]
    });

    let candidates = run_tool_call_for_prefetch("comms_tool", &read_threads_args, executor)
        .ok()
        .and_then(|value| value)
        .map(|value| parse_threads_from_comms_output(&value))
        .unwrap_or_default();

    let recommended_thread_id = if candidates.len() == 1 {
        Some(candidates[0].thread_id.clone())
    } else {
        None
    };
    let prefetched_messages = if let Some(thread_id) = recommended_thread_id.as_deref() {
        let read_messages_args = serde_json::json!({
            "ops": [
                {
                    "action": "read",
                    "target": "messages",
                    "selector": {
                        "threadId": thread_id,
                        "limit": 50
                    }
                }
            ]
        });
        run_tool_call_for_prefetch("comms_tool", &read_messages_args, executor)
            .ok()
            .and_then(|value| value)
            .map(|value| parse_messages_from_comms_output(&value))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    MessageCheckPrefetchResult {
        method,
        folder: folder.trim().to_string(),
        query: query.trim().to_string(),
        candidates,
        recommended_thread_id,
        prefetched_messages,
    }
}

fn normalize(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || ch.is_ascii_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn account_name_hint(display_name: &str) -> String {
    display_name
        .split('(')
        .next()
        .unwrap_or(display_name)
        .trim()
        .to_string()
}

fn score_match(recipient_ref_norm: &str, candidate_name_norm: &str) -> i32 {
    if recipient_ref_norm == candidate_name_norm {
        return 100;
    }
    if candidate_name_norm.starts_with(recipient_ref_norm) {
        return 85;
    }
    if candidate_name_norm.contains(recipient_ref_norm) || recipient_ref_norm.contains(candidate_name_norm) {
        return 70;
    }
    0
}

pub fn resolve_message_send_prefetch(
    method: MessageMethod,
    recipient_ref: &str,
    operators: &[DirectoryOperator],
    accounts: &[DirectoryAccount],
) -> CommsPrefetchResult {
    let recipient_ref_norm = normalize(recipient_ref);
    let mut operator_title_by_norm_name: HashMap<String, String> = HashMap::new();
    for operator in operators {
        operator_title_by_norm_name
            .entry(normalize(&operator.name))
            .or_insert_with(|| operator.title.trim().to_string());
    }

    let method_channel = method.as_str();
    let mut ranked: Vec<(i32, ResolvedRecipient)> = Vec::new();
    for account in accounts.iter().filter(|value| value.channel.eq_ignore_ascii_case(method_channel)) {
        if account.address.trim().is_empty() {
            continue;
        }
        let inferred_name = account_name_hint(&account.display_name);
        let inferred_norm = normalize(&inferred_name);
        let score = score_match(&recipient_ref_norm, &inferred_norm);
        if score <= 0 {
            continue;
        }
        let title = operator_title_by_norm_name
            .get(&inferred_norm)
            .cloned()
            .unwrap_or_else(|| "Operator".to_string());
        ranked.push((
            score,
            ResolvedRecipient {
                name: inferred_name,
                title,
                destination: account.address.trim().to_string(),
            },
        ));
    }

    ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.cmp(&b.1.name)));
    let candidates = ranked.into_iter().map(|(_, value)| value).take(5).collect::<Vec<_>>();

    CommsPrefetchResult {
        method,
        recipient_ref: recipient_ref.trim().to_string(),
        candidates,
        clarification_question: None,
        operator_directory_raw: None,
    }
}
