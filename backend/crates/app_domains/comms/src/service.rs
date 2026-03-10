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
                    let threads = store.list_threads(
                        channel.as_deref(),
                        account_id.as_deref(),
                        folder.as_deref(),
                        search.as_deref(),
                        limit,
                        offset,
                    )?;
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
                    data.push(json!({ "thread": thread }));
                }
                ("create", "message") => {
                    let thread_id = payload_string(op.payload.as_ref(), "threadId")
                        .ok_or_else(|| DomainError::InvalidInput("create message requires payload.threadId".to_string()))?;
                    let direction = payload_string(op.payload.as_ref(), "direction")
                        .unwrap_or_else(|| "outbound".to_string());
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
                    let message = store.append_message(
                        &thread_id,
                        &direction,
                        &from_account_ref,
                        to_participants,
                        cc_participants,
                        bcc_participants,
                        subject.as_deref(),
                        &body_text,
                        reply_to_message_id.as_deref(),
                    )?;
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
