use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{PersistenceError, PersistenceStateStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommsManageExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

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

fn invalid_input(message: impl Into<String>) -> PersistenceError {
    PersistenceError::Io {
        context: "Invalid comms_tool input",
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into()),
        path: None,
    }
}

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

impl PersistenceStateStore {
    pub fn execute_comms_tool(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<CommsManageExecutionOutput, PersistenceError> {
        let request: CommsToolRequest = serde_json::from_value(args.clone())
            .map_err(|error| invalid_input(error.to_string()))?;
        if request.ops.is_empty() {
            return Err(invalid_input("ops[] is required"));
        }
        if request.atomic {
            return Err(invalid_input(
                "atomic=true is not yet supported for comms_tool in this build",
            ));
        }

        let mut op_results: Vec<CommsOpResult> = Vec::new();
        let mut data = Vec::new();

        for op in request.ops {
            let action = op.action.trim().to_ascii_lowercase();
            let target = op.target.trim().to_ascii_lowercase();
            match (action.as_str(), target.as_str()) {
                ("read", "thread") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| invalid_input("read thread requires selector.threadId"))?;
                    let thread = self.get_thread(workspace_id, &thread_id)?;
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
                ("read", "messages") => {
                    let thread_id = selector_string(op.selector.as_ref(), "threadId")
                        .ok_or_else(|| invalid_input("read messages requires selector.threadId"))?;
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
                    let messages = self.list_thread_messages(workspace_id, &thread_id, limit, offset)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: format!("loaded {} messages", messages.len()),
                    });
                    data.push(json!({ "threadId": thread_id, "messages": messages }));
                }
                ("create", "thread") => {
                    let operator_id = payload_string(op.payload.as_ref(), "operatorId")
                        .ok_or_else(|| invalid_input("create thread requires payload.operatorId"))?;
                    let title = payload_string(op.payload.as_ref(), "title");
                    let thread = self.create_thread(workspace_id, &operator_id, title.as_deref())?;
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
                        .ok_or_else(|| invalid_input("create message requires payload.threadId"))?;
                    let role = payload_string(op.payload.as_ref(), "role")
                        .unwrap_or_else(|| "assistant".to_string());
                    let content = payload_string(op.payload.as_ref(), "content")
                        .ok_or_else(|| invalid_input("create message requires payload.content"))?;
                    let message = self.append_thread_message(workspace_id, &thread_id, &role, &content)?;
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
                        .ok_or_else(|| invalid_input("edit thread requires selector.threadId"))?;
                    let title = payload_string(op.payload.as_ref(), "title");
                    let summary = payload_string(op.payload.as_ref(), "summary");
                    let status = payload_string(op.payload.as_ref(), "status");
                    let thread = self.update_thread(
                        workspace_id,
                        &thread_id,
                        title.as_deref(),
                        summary.as_deref(),
                        status.as_deref(),
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
                        .ok_or_else(|| invalid_input("delete thread requires selector.threadId"))?;
                    self.delete_thread(workspace_id, &thread_id)?;
                    op_results.push(CommsOpResult {
                        action,
                        target,
                        status: "ok".to_string(),
                        message: "thread deleted".to_string(),
                    });
                    data.push(json!({ "threadId": thread_id, "deleted": true }));
                }
                _ => {
                    return Err(invalid_input(format!(
                        "unsupported op action/target: {}/{}",
                        action, target
                    )));
                }
            }
        }

        let summary = format!("Comms ops completed: {}", op_results.len());
        Ok(CommsManageExecutionOutput {
            summary,
            structured_data: json!({
                "operations": op_results,
                "data": data
            }),
        })
    }
}

