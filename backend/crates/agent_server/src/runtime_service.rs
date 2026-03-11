use std::{collections::HashMap, sync::Mutex};

use adapter::{app_tool_backend::PersistentAppToolBackend, gemini::model_inference::GeminiCliModelInference};
use app_persistence::CommsThreadRecord;
use app_persistence::PersistenceStateStore;
use agent_core::{
    models::{
        blocks::MessageBlock,
        run::{RunEvent, RunRequest},
    },
    runtime::engine::execute_run_once_with_tools,
    tools::app_dispatch::execute_app_tool_by_id,
};

const MAX_THREAD_MESSAGES: usize = 80;
const HISTORY_MAX_MESSAGES: usize = 16;
const HISTORY_MAX_CHARS: usize = 6_000;

#[derive(Debug, Clone)]
struct ThreadMessage {
    role: &'static str,
    content: String,
}

pub struct RuntimeService {
    events_by_run: Mutex<HashMap<String, Vec<RunEvent>>>,
    history_by_thread: Mutex<HashMap<String, Vec<ThreadMessage>>>,
    inference: GeminiCliModelInference,
    state_store: PersistenceStateStore,
    workspace_id: String,
}

impl RuntimeService {
    pub fn new(state_store: PersistenceStateStore, workspace_id: String) -> Self {
        Self {
            events_by_run: Mutex::new(HashMap::new()),
            history_by_thread: Mutex::new(HashMap::new()),
            inference: GeminiCliModelInference,
            state_store,
            workspace_id,
        }
    }

    pub fn start_run(&self, mut request: RunRequest) -> String {
        let run_id = request.run_id.clone();
        let workspace_id = request.workspace_id.clone();
        let thread_id = request.thread_id.clone();
        let thread_id_for_error = thread_id.clone();
        let user_message = request
            .input
            .metadata
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let history_excerpt = self.render_history_excerpt(&thread_id);
        let org_compact_preload = self
            .state_store
            .build_org_compact_preload(&self.workspace_id)
            .unwrap_or_else(|_| "(org preload unavailable)".to_string());
        if let Some(metadata) = request.input.metadata.as_object_mut() {
            metadata.insert(
                "history_excerpt".to_string(),
                serde_json::Value::String(history_excerpt.clone()),
            );
            metadata.insert(
                "org_compact_preload".to_string(),
                serde_json::Value::String(org_compact_preload),
            );
        }

        if let Ok(mut guard) = self.events_by_run.lock() {
            guard.insert(run_id.clone(), Vec::new());
        }
        let run_id_for_stream = run_id.clone();
        let mut stream_event = |event: RunEvent| {
            if let Ok(mut guard) = self.events_by_run.lock() {
                guard
                    .entry(run_id_for_stream.clone())
                    .or_default()
                    .push(event);
            }
        };

        let agent_id_for_tools = request.agent_id.clone();
        let workspace_id_for_tools = self.workspace_id.clone();
        let state_store_for_tools = self.state_store.clone();
        let app_tool_backend = PersistentAppToolBackend::new(self.state_store.clone(), self.workspace_id.clone());
        let events = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut tool_executor = |tool_name: &str, args: &serde_json::Value| {
                let normalized_args = if tool_name == "comms_tool" {
                    enforce_comms_sender_scope(
                        &state_store_for_tools,
                        &workspace_id_for_tools,
                        &agent_id_for_tools,
                        args,
                    )?
                } else {
                    args.clone()
                };
                execute_app_tool_by_id(&app_tool_backend, tool_name, &normalized_args)
            };
            execute_run_once_with_tools(request, &self.inference, &mut stream_event, Some(&mut tool_executor))
        }))
        .unwrap_or_else(|_| {
            vec![
                RunEvent::RunStarted {
                    workspace_id,
                    run_id: run_id.clone(),
                    thread_id: thread_id_for_error,
                    policy_snapshot_version: "v1".to_string(),
                    context_hash: "panic_recovery".to_string(),
                },
                RunEvent::RunFailed {
                    run_id: run_id.clone(),
                    error: agent_core::models::run::RunError {
                        code: "runtime_panic".to_string(),
                        message: "Runtime panic during run execution".to_string(),
                        retryable: false,
                    },
                },
            ]
        });

        let events = if events.is_empty() {
            vec![RunEvent::RunFailed {
                run_id: run_id.clone(),
                error: agent_core::models::run::RunError {
                    code: "runtime_empty_events".to_string(),
                    message: "Runtime returned no events".to_string(),
                    retryable: false,
                },
            }]
        } else {
            events
        };

        let assistant_text = extract_assistant_text(&events);
        if let Ok(mut guard) = self.events_by_run.lock() {
            let entry = guard.entry(run_id.clone()).or_default();
            if entry.is_empty() {
                *entry = events.clone();
            }
        }
        self.append_thread_turn(&thread_id, &user_message, assistant_text.as_deref());

        run_id
    }

    pub fn reserve_run(&self, run_id: &str, workspace_id: &str, thread_id: &str) {
        if let Ok(mut guard) = self.events_by_run.lock() {
            guard.entry(run_id.to_string()).or_insert_with(|| {
                vec![RunEvent::RunStarted {
                    workspace_id: workspace_id.to_string(),
                    run_id: run_id.to_string(),
                    thread_id: thread_id.to_string(),
                    policy_snapshot_version: "v1".to_string(),
                    context_hash: "reserved".to_string(),
                }]
            });
        }
    }

    pub fn list_run_events(&self, run_id: &str) -> Vec<RunEvent> {
        self.events_by_run
            .lock()
            .ok()
            .and_then(|guard| guard.get(run_id).cloned())
            .unwrap_or_default()
    }

    fn render_history_excerpt(&self, thread_id: &str) -> String {
        let Some(history) = self
            .history_by_thread
            .lock()
            .ok()
            .and_then(|guard| guard.get(thread_id).cloned())
        else {
            return String::new();
        };

        if history.is_empty() {
            return String::new();
        }

        let mut lines = Vec::new();
        let mut total_chars = 0usize;

        for message in history.iter().rev().take(HISTORY_MAX_MESSAGES) {
            let normalized = message
                .content
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if normalized.is_empty() {
                continue;
            }
            let line = format!("{}: {}", message.role, normalized);
            total_chars += line.len();
            if total_chars > HISTORY_MAX_CHARS {
                break;
            }
            lines.push(line);
        }

        lines.reverse();
        lines.join("\n")
    }

    fn append_thread_turn(&self, thread_id: &str, user_message: &str, assistant_message: Option<&str>) {
        let Ok(mut guard) = self.history_by_thread.lock() else {
            return;
        };
        let history = guard.entry(thread_id.to_string()).or_default();
        if !user_message.trim().is_empty() {
            history.push(ThreadMessage {
                role: "User",
                content: user_message.trim().to_string(),
            });
        }
        if let Some(value) = assistant_message {
            if !value.trim().is_empty() {
                history.push(ThreadMessage {
                    role: "Assistant",
                    content: value.trim().to_string(),
                });
            }
        }
        if history.len() > MAX_THREAD_MESSAGES {
            let overflow = history.len() - MAX_THREAD_MESSAGES;
            history.drain(0..overflow);
        }
    }
}

fn enforce_comms_sender_scope(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    operator_id: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, agent_core::models::run::RunError> {
    let mut normalized = args.clone();
    let Some(ops) = normalized.get_mut("ops").and_then(|value| value.as_array_mut()) else {
        return Ok(normalized);
    };
    let ops_snapshot = ops.clone();

    for (index, op) in ops.iter_mut().enumerate() {
        let action = op
            .get("action")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let target = op
            .get("target")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if action != "create" {
            continue;
        }

        if target == "thread" {
            let Some(payload) = op.get_mut("payload").and_then(|value| value.as_object_mut()) else {
                continue;
            };
            let channel_value = payload
                .get("channel")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .or_else(|| infer_channel_for_thread_op(&ops_snapshot, index, payload));
            let Some(channel) = channel_value else {
                continue;
            };
            payload.insert(
                "channel".to_string(),
                serde_json::Value::String(channel.clone()),
            );
            let account = resolve_operator_account_by_channel(
                state_store,
                workspace_id,
                operator_id,
                &channel,
            )?;
            payload.insert(
                "accountId".to_string(),
                serde_json::Value::String(account.account_id),
            );
            continue;
        }

        if target == "message" {
            let Some(payload) = op.get_mut("payload").and_then(|value| value.as_object_mut()) else {
                continue;
            };

            let channel = if let Some(value) = payload
                .get("channel")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                Some(value.to_string())
            } else if let Some(thread_id) = payload
                .get("threadId")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let thread = state_store
                    .get_comms_thread(workspace_id, thread_id)
                    .map_err(|error| agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: format!(
                            "comms_tool sender enforcement failed while loading thread {}: {}",
                            thread_id, error
                        ),
                        retryable: false,
                    })?
                    .ok_or_else(|| agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: format!(
                            "comms_tool create message requires a valid payload.threadId when payload.channel is not provided (thread not found: {})",
                            thread_id
                        ),
                        retryable: false,
                    })?;
                Some(thread.channel)
            } else {
                None
            };

            let Some(channel) = channel else {
                return Err(agent_core::models::run::RunError {
                    code: "tool_invalid_args".to_string(),
                    message: "comms_tool create message requires payload.threadId or payload.channel so sender can be auto-resolved from current operator.".to_string(),
                    retryable: false,
                });
            };

            let account = resolve_operator_account_by_channel(
                state_store,
                workspace_id,
                operator_id,
                &channel,
            )?;
            payload.insert(
                "fromAccountRef".to_string(),
                serde_json::Value::String(account.address.clone()),
            );

            if let Some(thread_id) = payload
                .get("threadId")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let normalized_thread_id = normalize_message_thread_for_sender(
                    state_store,
                    workspace_id,
                    thread_id,
                    &account.account_id,
                )?;
                if normalized_thread_id != thread_id {
                    payload.insert(
                        "threadId".to_string(),
                        serde_json::Value::String(normalized_thread_id),
                    );
                }
            }
        }
    }

    Ok(normalized)
}

fn resolve_operator_account_by_channel(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    operator_id: &str,
    channel: &str,
) -> Result<app_persistence::CommsAccountRecord, agent_core::models::run::RunError> {
    let accounts = state_store
        .list_comms_accounts(workspace_id, Some(operator_id), Some(channel))
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool sender enforcement failed while loading {} account for current operator: {}",
                channel, error
            ),
            retryable: false,
        })?;
    accounts
        .into_iter()
        .next()
        .ok_or_else(|| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "Current operator has no {} account configured. Cannot send via comms_tool on that channel.",
                channel
            ),
            retryable: false,
        })
}

fn normalize_message_thread_for_sender(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    thread_id: &str,
    expected_account_id: &str,
) -> Result<String, agent_core::models::run::RunError> {
    let Some(thread) = state_store
        .get_comms_thread(workspace_id, thread_id)
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool sender enforcement failed while validating thread {}: {}",
                thread_id, error
            ),
            retryable: false,
        })?
    else {
        return Ok(thread_id.to_string());
    };
    verify_thread_owner_or_remap(state_store, workspace_id, thread, expected_account_id)
}

fn verify_thread_owner_or_remap(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    thread: CommsThreadRecord,
    expected_account_id: &str,
) -> Result<String, agent_core::models::run::RunError> {
    if thread.account_id != expected_account_id {
        if !thread.thread_key.trim().is_empty() {
            let remapped = state_store
                .find_latest_comms_thread_by_thread_key(
                    workspace_id,
                    &thread.channel,
                    expected_account_id,
                    &thread.thread_key,
                )
                .map_err(|error| agent_core::models::run::RunError {
                    code: "tool_invalid_args".to_string(),
                    message: format!(
                        "comms_tool sender enforcement failed while remapping thread {}: {}",
                        thread.thread_id, error
                    ),
                    retryable: false,
                })?;
            if let Some(value) = remapped {
                return Ok(value.thread_id);
            }
        }
        return Err(agent_core::models::run::RunError {
            code: "tool_permission_denied".to_string(),
            message: "comms_tool rejected outbound send: target thread is not owned by current operator sender account.".to_string(),
            retryable: false,
        });
    }
    Ok(thread.thread_id)
}

fn infer_channel_for_thread_op(
    ops_snapshot: &[serde_json::Value],
    current_index: usize,
    thread_payload: &serde_json::Map<String, serde_json::Value>,
) -> Option<String> {
    if thread_payload
        .get("subject")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        return Some("email".to_string());
    }
    if thread_payload
        .get("participants")
        .and_then(|value| value.get("peerNumber"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        return Some("sms".to_string());
    }
    if thread_payload
        .get("participants")
        .and_then(|value| value.get("kind"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        return Some("chat".to_string());
    }

    for value in ops_snapshot.iter().skip(current_index + 1) {
        let action = value
            .get("action")
            .and_then(|raw| raw.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let target = value
            .get("target")
            .and_then(|raw| raw.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if action != "create" || target != "message" {
            continue;
        }
        let Some(payload) = value.get("payload").and_then(|raw| raw.as_object()) else {
            continue;
        };
        if let Some(channel) = payload
            .get("channel")
            .and_then(|raw| raw.as_str())
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
        {
            return Some(channel.to_string());
        }
        if payload
            .get("subject")
            .and_then(|raw| raw.as_str())
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
            .is_some()
        {
            return Some("email".to_string());
        }
        if let Some(first_recipient) = payload
            .get("toParticipants")
            .and_then(|raw| raw.as_array())
            .and_then(|items| items.first())
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
        {
            if first_recipient.contains('@') {
                return Some("email".to_string());
            }
            if first_recipient.starts_with('+') {
                return Some("sms".to_string());
            }
            return Some("chat".to_string());
        }
    }

    None
}

fn extract_assistant_text(events: &[RunEvent]) -> Option<String> {
    for event in events {
        if let RunEvent::BlocksProduced { blocks, .. } = event {
            let mut lines = Vec::new();
            for block in blocks {
                if let MessageBlock::AssistantText { text } = block {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        lines.push(trimmed.to_string());
                    }
                }
            }
            if !lines.is_empty() {
                return Some(lines.join("\n\n"));
            }
        }
    }

    for event in events {
        if let RunEvent::RunFailed { error, .. } = event {
            if !error.message.trim().is_empty() {
                return Some(format!("Run failed: {}", error.message.trim()));
            }
        }
    }

    None
}
