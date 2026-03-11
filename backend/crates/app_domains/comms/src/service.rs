use app_domains_core::{errors::DomainError, DomainResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    models::{CommsChannel, OutboundMessageDraft},
    ports::{CommsToolExecutionOutput, CommsToolStore},
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommsToolRequest {
    #[serde(default)]
    ops: Vec<CommsToolOp>,
    #[serde(default)]
    atomic: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommsToolOp {
    action: String,
    target: String,
    #[serde(default)]
    selector: Option<Value>,
    #[serde(default)]
    payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommsOpResult {
    action: String,
    target: String,
    status: String,
    message: String,
}

#[derive(Default, Clone)]
pub struct CommsDomainService;

fn selector_string(selector: Option<&Value>, key: &str) -> Option<String> {
    selector
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn payload_string(payload: Option<&Value>, key: &str) -> Option<String> {
    payload
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalized_text(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn edit_distance_at_most_two(a: &str, b: &str) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    let a_chars = a.chars().collect::<Vec<_>>();
    let b_chars = b.chars().collect::<Vec<_>>();
    let a_len = a_chars.len();
    let b_len = b_chars.len();
    if a_len.abs_diff(b_len) > 2 {
        return false;
    }
    let mut prev = (0..=b_len).collect::<Vec<_>>();
    let mut curr = vec![0usize; b_len + 1];
    for i in 1..=a_len {
        curr[0] = i;
        for j in 1..=b_len {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b_len] <= 2
}

fn fuzzy_contains(haystack: &str, needle: &str) -> bool {
    let h = normalized_text(haystack);
    let n = normalized_text(needle);
    if h.is_empty() || n.is_empty() {
        return false;
    }
    if h.contains(&n) || n.contains(&h) {
        return true;
    }
    h.split_whitespace().any(|token| {
        token.starts_with(&n) || n.starts_with(token) || edit_distance_at_most_two(token, &n)
    })
}

fn participants_text(value: Option<&Value>) -> String {
    let Some(value) = value else {
        return String::new();
    };
    let mut parts: Vec<String> = Vec::new();
    match value {
        Value::String(single) => {
            parts.push(single.clone());
        }
        Value::Array(items) => {
            for item in items {
                if let Some(single) = item.as_str() {
                    parts.push(single.to_string());
                }
            }
        }
        Value::Object(map) => {
            for key in ["from", "to", "members", "memberAddresses", "peerNumber"] {
                if let Some(entry) = map.get(key) {
                    let nested = participants_text(Some(entry));
                    if !nested.is_empty() {
                        parts.push(nested);
                    }
                }
            }
        }
        _ => {}
    }
    parts.join(" ")
}

impl CommsDomainService {
    pub fn execute_tool_request(
        &self,
        store: &dyn CommsToolStore,
        args: &Value,
    ) -> DomainResult<CommsToolExecutionOutput> {
        let request: CommsToolRequest = serde_json::from_value(args.clone())
            .map_err(|error| DomainError::InvalidInput(error.to_string()))?;
        if request.ops.is_empty() {
            return Err(DomainError::InvalidInput("ops[] is required".to_string()));
        }
        if request.atomic {
            return Err(DomainError::InvalidInput(
                "atomic=true is not yet supported for comms_tool in this build".to_string(),
            ));
        }

        let mut op_results: Vec<CommsOpResult> = Vec::new();
        let mut data = Vec::new();
        let mut last_created_thread_id: Option<String> = None;

        for op in request.ops {
            let action = op.action.trim().to_ascii_lowercase();
            let target = op.target.trim().to_ascii_lowercase();
            match (action.as_str(), target.as_str()) {
                ("read", "account") => {
                    let account_id = selector_string(op.selector.as_ref(), "accountId")
                        .ok_or_else(|| DomainError::InvalidInput("read account requires selector.accountId".to_string()))?;
                    let account = store.get_account(&account_id)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: if account.is_some() {
                            "account loaded".to_string()
                        } else {
                            "account not found".to_string()
                        },
                    });
                    data.push(json!({ "account": account }));
                }
                ("read", "accounts") => {
                    let operator_id = selector_string(op.selector.as_ref(), "operatorId");
                    let channel = selector_string(op.selector.as_ref(), "channel");
                    let accounts = store.list_accounts(operator_id.as_deref(), channel.as_deref())?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: format!("loaded {} accounts", accounts.len()),
                    });
                    data.push(json!({ "accounts": accounts }));
                }
                ("read", "operator_directory") => {
                    let channel = selector_string(op.selector.as_ref(), "channel");
                    let query = selector_string(op.selector.as_ref(), "query");
                    let name = selector_string(op.selector.as_ref(), "name");
                    let title = selector_string(op.selector.as_ref(), "title");
                    let limit = op
                        .selector
                        .as_ref()
                        .and_then(|value| value.get("limit"))
                        .and_then(|value| value.as_i64())
                        .unwrap_or(20);
                    let matches = store.list_operator_directory(
                        channel.as_deref(),
                        query.as_deref(),
                        name.as_deref(),
                        title.as_deref(),
                        limit,
                    )?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: format!("loaded {} directory matches", matches.len()),
                    });
                    data.push(json!({ "matches": matches }));
                }
                ("read", "thread") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("read thread requires selector.threadId".to_string()))?;
                    let thread = store.get_thread(&thread_id)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: if thread.is_some() {
                            "thread loaded".to_string()
                        } else {
                            "thread not found".to_string()
                        },
                    });
                    data.push(json!({ "thread": thread }));
                }
                ("read", "threads") => {
                    let channel = selector_string(op.selector.as_ref(), "channel");
                    let account_id = selector_string(op.selector.as_ref(), "accountId");
                    let folder = selector_string(op.selector.as_ref(), "folder");
                    let search = selector_string(op.selector.as_ref(), "search");
                    let from_participant = selector_string(op.selector.as_ref(), "fromParticipant");
                    let to_participant = selector_string(op.selector.as_ref(), "toParticipant");
                    let subject_contains = selector_string(op.selector.as_ref(), "subjectContains");
                    let state_filter = selector_string(op.selector.as_ref(), "state");
                    let limit = op
                        .selector
                        .as_ref()
                        .and_then(|value| value.get("limit"))
                        .and_then(|value| value.as_i64())
                        .unwrap_or(200);
                    let offset = op
                        .selector
                        .as_ref()
                        .and_then(|value| value.get("offset"))
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0);

                    let use_extended_filters = from_participant.is_some()
                        || to_participant.is_some()
                        || subject_contains.is_some()
                        || state_filter.is_some();
                    let source_limit = if use_extended_filters {
                        limit.max(200).min(1000)
                    } else {
                        limit
                    };
                    let source_offset = if use_extended_filters { 0 } else { offset };
                    let mut threads = store.list_threads(
                        channel.as_deref(),
                        account_id.as_deref(),
                        folder.as_deref(),
                        search.as_deref(),
                        source_limit,
                        source_offset,
                    )?;

                    if use_extended_filters {
                        threads.retain(|thread| {
                            let passes_from = from_participant.as_ref().map_or(true, |needle| {
                                fuzzy_contains(
                                    &participants_text(thread.get("participants").and_then(|v| v.get("from"))),
                                    needle,
                                )
                            });
                            let passes_to = to_participant.as_ref().map_or(true, |needle| {
                                fuzzy_contains(
                                    &participants_text(thread.get("participants").and_then(|v| v.get("to"))),
                                    needle,
                                )
                            });
                            let passes_subject = subject_contains.as_ref().map_or(true, |needle| {
                                let subject = thread
                                    .get("subject")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("");
                                let title = thread
                                    .get("title")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("");
                                fuzzy_contains(subject, needle) || fuzzy_contains(title, needle)
                            });
                            let passes_state = state_filter.as_ref().map_or(true, |needle| {
                                let state = thread
                                    .get("state")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("");
                                normalized_text(state) == normalized_text(needle)
                            });
                            passes_from && passes_to && passes_subject && passes_state
                        });

                        let start = offset.max(0) as usize;
                        let end = (start + limit.max(1) as usize).min(threads.len());
                        threads = if start >= threads.len() {
                            Vec::new()
                        } else {
                            threads[start..end].to_vec()
                        };
                    }
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: format!("loaded {} threads", threads.len()),
                    });
                    data.push(json!({ "threads": threads }));
                }
                ("read", "messages") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("read messages requires selector.threadId".to_string()))?;
                    let limit = op
                        .selector
                        .as_ref()
                        .and_then(|value| value.get("limit"))
                        .and_then(|value| value.as_i64())
                        .unwrap_or(200);
                    let offset = op
                        .selector
                        .as_ref()
                        .and_then(|value| value.get("offset"))
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0);
                    let messages = store.list_messages(&thread_id, limit, offset)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: format!("loaded {} messages", messages.len()),
                    });
                    data.push(json!({ "threadId": thread_id, "messages": messages }));
                }
                ("read", "message") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("read message requires selector.threadId".to_string()))?;
                    let message_id = selector_string(op.selector.as_ref(), "messageId")
                        .ok_or_else(|| DomainError::InvalidInput("read message requires selector.messageId".to_string()))?;
                    let message = store.get_message(&thread_id, &message_id)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: if message.is_some() {
                            "message loaded".to_string()
                        } else {
                            "message not found".to_string()
                        },
                    });
                    data.push(json!({ "message": message }));
                }
                ("create", "account") => {
                    let account_id = payload_string(op.payload.as_ref(), "accountId")
                        .ok_or_else(|| DomainError::InvalidInput("create account requires payload.accountId".to_string()))?;
                    let operator_id = payload_string(op.payload.as_ref(), "operatorId")
                        .ok_or_else(|| DomainError::InvalidInput("create account requires payload.operatorId".to_string()))?;
                    let channel = payload_string(op.payload.as_ref(), "channel")
                        .ok_or_else(|| DomainError::InvalidInput("create account requires payload.channel".to_string()))?;
                    let address = payload_string(op.payload.as_ref(), "address")
                        .ok_or_else(|| DomainError::InvalidInput("create account requires payload.address".to_string()))?;
                    let display_name = payload_string(op.payload.as_ref(), "displayName")
                        .unwrap_or_else(|| operator_id.clone());
                    let account = store.upsert_account(
                        &account_id,
                        &operator_id,
                        &channel,
                        &address,
                        &display_name,
                        Some("active"),
                    )?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: "account upserted".to_string(),
                    });
                    data.push(json!({ "account": account }));
                }
                ("create", "thread") => {
                    let account_id = payload_string(op.payload.as_ref(), "accountId")
                        .ok_or_else(|| DomainError::InvalidInput("create thread requires payload.accountId".to_string()))?;
                    let channel = payload_string(op.payload.as_ref(), "channel")
                        .ok_or_else(|| DomainError::InvalidInput("create thread requires payload.channel".to_string()))?;
                    let title = payload_string(op.payload.as_ref(), "title");
                    let subject = payload_string(op.payload.as_ref(), "subject");
                    let folder = payload_string(op.payload.as_ref(), "folder");
                    let participants = op
                        .payload
                        .as_ref()
                        .and_then(|value| value.get("participants"));
                    let thread = store.create_thread(
                        &channel,
                        &account_id,
                        title.as_deref(),
                        subject.as_deref(),
                        participants,
                        folder.as_deref(),
                    )?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: "thread created".to_string(),
                    });
                    last_created_thread_id = thread
                        .get("threadId")
                        .and_then(|value| value.as_str())
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty());
                    data.push(json!({ "thread": thread }));
                }
                ("create", "message") => {
                    let requested_thread_id = payload_string(op.payload.as_ref(), "threadId");
                    let thread_id = requested_thread_id.as_deref().and_then(|value| {
                        if value.eq_ignore_ascii_case("new") {
                            last_created_thread_id.as_deref()
                        } else {
                            Some(value)
                        }
                    });
                    let direction = payload_string(op.payload.as_ref(), "direction")
                        .unwrap_or_else(|| "outbound".to_string());
                    let channel = payload_string(op.payload.as_ref(), "channel");
                    let from_account_ref = payload_string(op.payload.as_ref(), "fromAccountRef")
                        .ok_or_else(|| DomainError::InvalidInput("create message requires payload.fromAccountRef".to_string()))?;
                    let body_text = payload_string(op.payload.as_ref(), "bodyText")
                        .ok_or_else(|| DomainError::InvalidInput("create message requires payload.bodyText".to_string()))?;
                    let subject = payload_string(op.payload.as_ref(), "subject");
                    let reply_to_message_id = payload_string(op.payload.as_ref(), "replyToMessageId");
                    let to_participants = op
                        .payload
                        .as_ref()
                        .and_then(|value| value.get("toParticipants"));
                    let cc_participants = op
                        .payload
                        .as_ref()
                        .and_then(|value| value.get("ccParticipants"));
                    let bcc_participants = op
                        .payload
                        .as_ref()
                        .and_then(|value| value.get("bccParticipants"));
                    let message = if direction.eq_ignore_ascii_case("outbound") {
                        let outbound_channel = channel
                            .clone()
                            .or_else(|| {
                                if subject.as_ref().map(|value| !value.trim().is_empty()).unwrap_or(false) {
                                    Some("email".to_string())
                                } else {
                                    None
                                }
                            })
                            .or_else(|| {
                                to_participants
                                    .and_then(|value| value.as_array())
                                    .and_then(|items| items.first())
                                    .and_then(|item| item.as_str())
                                    .map(str::trim)
                                    .filter(|value| !value.is_empty())
                                    .map(|value| {
                                        if value.contains('@') {
                                            "email".to_string()
                                        } else if value.starts_with('+') {
                                            "sms".to_string()
                                        } else {
                                            "chat".to_string()
                                        }
                                    })
                            })
                            .ok_or_else(|| {
                                DomainError::InvalidInput(
                                    "create message outbound requires payload.channel or inferable recipient/subject"
                                        .to_string(),
                                )
                            })?;
                        store.send_outbound_message(
                            &outbound_channel,
                            thread_id,
                            &from_account_ref,
                            to_participants,
                            cc_participants,
                            bcc_participants,
                            subject.as_deref(),
                            &body_text,
                            reply_to_message_id.as_deref(),
                        )?
                    } else {
                        let resolved_thread_id = thread_id.ok_or_else(|| {
                            DomainError::InvalidInput(
                                "create message inbound requires payload.threadId".to_string(),
                            )
                        })?;
                        store.append_message(
                            resolved_thread_id,
                            &direction,
                            &from_account_ref,
                            to_participants,
                            cc_participants,
                            bcc_participants,
                            subject.as_deref(),
                            &body_text,
                            reply_to_message_id.as_deref(),
                        )?
                    };
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: "message created".to_string(),
                    });
                    data.push(json!({ "message": message }));
                }
                ("edit", "thread") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("edit thread requires selector.threadId".to_string()))?;
                    let title = payload_string(op.payload.as_ref(), "title");
                    let subject = payload_string(op.payload.as_ref(), "subject");
                    let status = payload_string(op.payload.as_ref(), "status");
                    let folder = payload_string(op.payload.as_ref(), "folder");
                    let thread = store.update_thread(
                        &thread_id,
                        title.as_deref(),
                        subject.as_deref(),
                        status.as_deref(),
                        folder.as_deref(),
                    )?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: if thread.is_some() {
                            "thread updated".to_string()
                        } else {
                            "thread not found".to_string()
                        },
                    });
                    data.push(json!({ "thread": thread }));
                }
                ("delete", "thread") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("delete thread requires selector.threadId".to_string()))?;
                    store.delete_thread(&thread_id)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: "thread deleted".to_string(),
                    });
                    data.push(json!({ "threadId": thread_id, "deleted": true }));
                }
                _ => {
                    return Err(DomainError::InvalidInput(format!(
                        "unsupported op action/target: {}/{}",
                        action, target
                    )));
                }
            }
        }

        let summary = format!("Comms ops completed: {}", op_results.len());
        Ok(CommsToolExecutionOutput {
            summary,
            structured_data: json!({
                "operations": op_results,
                "data": data,
            }),
        })
    }

    pub fn build_outbound_draft(
        &self,
        channel: CommsChannel,
        sender: &str,
        recipient: &str,
        subject: Option<&str>,
        body: &str,
    ) -> DomainResult<OutboundMessageDraft> {
        let sender = sender.trim();
        let recipient = recipient.trim();
        let body = body.trim();

        if sender.is_empty() {
            return Err(DomainError::InvalidInput("sender is required".to_string()));
        }
        if recipient.is_empty() {
            return Err(DomainError::InvalidInput("recipient is required".to_string()));
        }
        if body.is_empty() {
            return Err(DomainError::InvalidInput("body is required".to_string()));
        }

        let subject = match channel {
            CommsChannel::Email => {
                let value = subject.map(|value| value.trim().to_string()).unwrap_or_default();
                if value.is_empty() {
                    return Err(DomainError::InvalidInput("email subject is required".to_string()));
                }
                Some(value)
            }
            CommsChannel::Sms | CommsChannel::Chat => None,
        };

        Ok(OutboundMessageDraft {
            channel,
            sender: sender.to_string(),
            recipient: recipient.to_string(),
            subject,
            body: body.to_string(),
        })
    }
}
