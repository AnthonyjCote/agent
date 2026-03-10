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
            MessageMethod::Email => "{\"ops\":[{\"action\":\"create\",\"target\":\"thread\",\"payload\":{\"channel\":\"email\",\"accountId\":\"<sender_account_id>\",\"title\":\"<recipient name>\",\"subject\":\"<subject>\"}},{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"threadId\":\"<thread_id>\",\"direction\":\"outbound\",\"fromAccountRef\":\"<sender_email>\",\"toParticipants\":[\"<recipient_email>\"],\"subject\":\"<subject>\",\"bodyText\":\"<body>\"}}]}",
            MessageMethod::Sms => "{\"ops\":[{\"action\":\"create\",\"target\":\"thread\",\"payload\":{\"channel\":\"sms\",\"accountId\":\"<sender_account_id>\",\"title\":\"<recipient name>\",\"participants\":{\"peerNumber\":\"<recipient_phone>\"}}},{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"threadId\":\"<thread_id>\",\"direction\":\"outbound\",\"fromAccountRef\":\"<sender_phone>\",\"toParticipants\":[\"<recipient_phone>\"],\"bodyText\":\"<body>\"}}]}",
            MessageMethod::Chat => "{\"ops\":[{\"action\":\"create\",\"target\":\"thread\",\"payload\":{\"channel\":\"chat\",\"accountId\":\"<sender_account_id>\",\"title\":\"<recipient name>\",\"participants\":{\"kind\":\"dm\",\"memberAddresses\":[\"<sender_chat>\",\"<recipient_chat>\"]}}},{\"action\":\"create\",\"target\":\"message\",\"payload\":{\"threadId\":\"<thread_id>\",\"direction\":\"outbound\",\"fromAccountRef\":\"<sender_chat>\",\"toParticipants\":[\"<recipient_chat>\"],\"bodyText\":\"<body>\"}}]}",
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

pub fn resolve_message_send_prefetch_from_tools(
    method: MessageMethod,
    recipient_ref: &str,
    executor: &mut dyn FnMut(&str, &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError>,
) -> CommsPrefetchResult {
    let org_snapshot_args = serde_json::json!({
        "action": "read",
        "items": [{"target": "snapshot"}]
    });
    let comms_accounts_args = serde_json::json!({
        "ops": [
            {
                "action": "read",
                "target": "accounts",
                "selector": {
                    "channel": method.as_str()
                }
            }
        ]
    });

    // v1 source set: operator directory + comms accounts.
    // Extension hook: merge CRM contact directory candidates here in a later revision.
    let operators = run_tool_call_for_prefetch("org_manage_entities_v2", &org_snapshot_args, executor)
        .ok()
        .and_then(|value| value)
        .map(|value| parse_directory_operators_from_org_output(&value))
        .unwrap_or_default();
    let accounts = run_tool_call_for_prefetch("comms_tool", &comms_accounts_args, executor)
        .ok()
        .and_then(|value| value)
        .map(|value| parse_directory_accounts_from_comms_output(&value))
        .unwrap_or_default();

    resolve_message_send_prefetch(method, recipient_ref, &operators, &accounts)
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

    let clarification_question = if recipient_ref.trim().is_empty() {
        Some(format!(
            "Which recipient should I use for the {} message?",
            method.as_str()
        ))
    } else if candidates.is_empty() {
        Some(format!(
            "I couldn't find a {} contact match for \"{}\". Who should I send it to?",
            method.as_str(),
            recipient_ref.trim()
        ))
    } else if candidates.len() > 1 {
        let options = candidates
            .iter()
            .take(3)
            .map(|candidate| format!("{} ({})", candidate.name, candidate.title))
            .collect::<Vec<_>>()
            .join(", ");
        Some(format!(
            "I found multiple {} matches for \"{}\": {}. Which one should I use?",
            method.as_str(),
            recipient_ref.trim(),
            options
        ))
    } else {
        None
    };

    CommsPrefetchResult {
        method,
        recipient_ref: recipient_ref.trim().to_string(),
        candidates,
        clarification_question,
    }
}
