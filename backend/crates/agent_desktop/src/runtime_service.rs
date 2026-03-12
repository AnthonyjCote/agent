use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};

use adapter::{
    app_tool_backend::PersistentAppToolBackend,
    gemini::model_inference::{cancel_active_gemini_run, GeminiCliModelInference},
};
use app_persistence::CommsThreadRecord;
use app_persistence::PersistenceStateStore;
use agent_core::{
    models::{
        blocks::MessageBlock,
        channels::{ChannelEnvelope, ChannelKind},
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

#[derive(Debug, Clone)]
pub struct StartRunInput {
    pub workspace_id: String,
    pub run_id: String,
    pub thread_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub agent_role: String,
    pub agent_business_unit_name: String,
    pub agent_org_unit_name: String,
    pub agent_primary_objective: String,
    pub system_directive_short: String,
    pub sender: String,
    pub recipient: String,
    pub message: String,
    pub allowed_tool_ids: Vec<String>,
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

    pub fn start_run(&self, input: StartRunInput) -> String {
        let workspace_id_for_error = input.workspace_id.clone();
        let thread_id_for_error = input.thread_id.clone();
        let history_excerpt = self.render_history_excerpt(&input.thread_id);
        let org_compact_preload = self
            .state_store
            .build_org_compact_preload(&self.workspace_id)
            .unwrap_or_else(|_| "(org preload unavailable)".to_string());
        let user_message = input.message.trim().to_string();
        let request = RunRequest {
            workspace_id: input.workspace_id.clone(),
            run_id: input.run_id.clone(),
            thread_id: input.thread_id.clone(),
            agent_id: input.agent_id,
            agent_name: input.agent_name,
            agent_role: input.agent_role,
            system_directive_short: input.system_directive_short,
            input: ChannelEnvelope {
                workspace_id: input.workspace_id,
                channel: ChannelKind::ChatUi,
                sender: input.sender,
                recipient: input.recipient,
                thread_id: input.thread_id,
                task_id: None,
                correlation_id: "corr_v1_placeholder".to_string(),
                metadata: serde_json::json!({
                    "message": input.message,
                    "history_excerpt": history_excerpt,
                    "agent_business_unit_name": input.agent_business_unit_name,
                    "agent_org_unit_name": input.agent_org_unit_name,
                    "agent_primary_objective": input.agent_primary_objective,
                    "allowed_tool_ids": input.allowed_tool_ids,
                    "org_compact_preload": org_compact_preload
                }),
            },
        };

        let run_id = request.run_id.clone();
        let agent_name_for_tools = request.agent_name.clone();
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
                        &agent_name_for_tools,
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
                    workspace_id: workspace_id_for_error,
                    run_id: run_id.clone(),
                    thread_id: thread_id_for_error.clone(),
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
        let persisted_events: Vec<serde_json::Value> = events
            .iter()
            .filter_map(|event| serde_json::to_value(event).ok())
            .collect();
        let _ = self
            .state_store
            .replace_run_events(&self.workspace_id, &run_id, &persisted_events);
        self.append_thread_turn(&thread_id_for_error, &user_message, assistant_text.as_deref());

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
        let reserved = vec![serde_json::json!({
            "event": "run_started",
            "workspace_id": workspace_id,
            "run_id": run_id,
            "thread_id": thread_id,
            "policy_snapshot_version": "v1",
            "context_hash": "reserved"
        })];
        let _ = self
            .state_store
            .replace_run_events(&self.workspace_id, run_id, &reserved);
    }

    pub fn list_run_events_json(&self, run_id: &str) -> Vec<serde_json::Value> {
        let in_memory = self
            .events_by_run
            .lock()
            .ok()
            .and_then(|guard| guard.get(run_id).cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|event| serde_json::to_value(event).ok())
            .collect::<Vec<_>>();
        if !in_memory.is_empty() {
            return in_memory;
        }
        self.state_store
            .list_run_events(&self.workspace_id, run_id)
            .unwrap_or_default()
    }

    pub fn list_thread_run_ids(&self, thread_id: &str, limit: i64) -> Vec<String> {
        self.state_store
            .list_thread_run_ids(&self.workspace_id, thread_id, limit)
            .unwrap_or_default()
    }

    pub fn cancel_run(&self, run_id: &str) -> bool {
        let killed = cancel_active_gemini_run(run_id);
        if killed {
            if let Ok(mut guard) = self.events_by_run.lock() {
                guard
                    .entry(run_id.to_string())
                    .or_default()
                    .push(RunEvent::RunCancelled {
                        run_id: run_id.to_string(),
                    });
            }
            let mut events = self
                .state_store
                .list_run_events(&self.workspace_id, run_id)
                .unwrap_or_default();
            events.push(serde_json::json!({
                "event": "run_cancelled",
                "run_id": run_id
            }));
            let _ = self
                .state_store
                .replace_run_events(&self.workspace_id, run_id, &events);
        }
        killed
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
    operator_name: &str,
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
        if action == "read" {
            if target == "accounts" {
                if let Some(selector) = ensure_selector_object_mut(op) {
                    selector.insert(
                        "operatorId".to_string(),
                        serde_json::Value::String(operator_id.trim().to_string()),
                    );
                }
                continue;
            }

            if target == "threads" {
                let selector = ensure_selector_object_mut(op).ok_or_else(|| {
                    agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: "comms_tool read threads requires a valid selector object."
                            .to_string(),
                        retryable: false,
                    }
                })?;
                let channel = selector
                    .get("channel")
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("email")
                    .to_string();
                let account = resolve_operator_account_by_channel(
                    state_store,
                    workspace_id,
                    operator_id,
                    operator_name,
                    &channel,
                )?;
                selector.insert(
                    "channel".to_string(),
                    serde_json::Value::String(channel),
                );
                selector.insert(
                    "accountId".to_string(),
                    serde_json::Value::String(account.account_id),
                );
                continue;
            }

            if target == "account" {
                let selector = ensure_selector_object_mut(op).ok_or_else(|| {
                    agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: "comms_tool read account requires a valid selector object."
                            .to_string(),
                        retryable: false,
                    }
                })?;
                let channel = selector
                    .get("channel")
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("email")
                    .to_string();
                let account = resolve_operator_account_by_channel(
                    state_store,
                    workspace_id,
                    operator_id,
                    operator_name,
                    &channel,
                )?;
                selector.insert(
                    "channel".to_string(),
                    serde_json::Value::String(channel),
                );
                selector.insert(
                    "accountId".to_string(),
                    serde_json::Value::String(account.account_id),
                );
                continue;
            }

            if matches!(target.as_str(), "thread" | "messages" | "message") {
                let selector = ensure_selector_object_mut(op).ok_or_else(|| {
                    agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: format!(
                            "comms_tool read {} requires a valid selector object.",
                            target
                        ),
                        retryable: false,
                    }
                })?;
                let Some(thread_id) = selector
                    .get("threadId")
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                else {
                    return Err(agent_core::models::run::RunError {
                        code: "tool_invalid_args".to_string(),
                        message: format!("comms_tool read {} requires selector.threadId.", target),
                        retryable: false,
                    });
                };
                assert_thread_owned_by_operator(
                    state_store,
                    workspace_id,
                    thread_id,
                    operator_id,
                    operator_name,
                )?;
                continue;
            }
        }

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
                operator_name,
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
                operator_name,
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
    operator_name: &str,
    channel: &str,
) -> Result<app_persistence::CommsAccountRecord, agent_core::models::run::RunError> {
    let direct_accounts = state_store
        .list_comms_accounts(workspace_id, Some(operator_id), Some(channel))
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool sender enforcement failed while loading {} account for current operator: {}",
                channel, error
            ),
            retryable: false,
        })?;
    if let Some(account) = direct_accounts.into_iter().next() {
        return Ok(account);
    }

    if let Some(mapped_operator_id) = resolve_operator_id_by_display_name(
        state_store,
        workspace_id,
        channel,
        operator_name,
    )? {
        let mapped_accounts = state_store
            .list_comms_accounts(workspace_id, Some(mapped_operator_id.as_str()), Some(channel))
            .map_err(|error| agent_core::models::run::RunError {
                code: "tool_invalid_args".to_string(),
                message: format!(
                    "comms_tool sender enforcement failed while loading mapped {} account for operator {}: {}",
                    channel, mapped_operator_id, error
                ),
                retryable: false,
            })?;
        if let Some(account) = mapped_accounts.into_iter().next() {
            return Ok(account);
        }
        return ensure_operator_channel_account(
            state_store,
            workspace_id,
            mapped_operator_id.as_str(),
            operator_name,
            channel,
        );
    }

    ensure_operator_channel_account(
        state_store,
        workspace_id,
        operator_id,
        operator_name,
        channel,
    )
}

fn resolve_operator_id_by_display_name(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    channel: &str,
    operator_name: &str,
) -> Result<Option<String>, agent_core::models::run::RunError> {
    let all_channel_accounts = state_store
        .list_comms_accounts(workspace_id, None, Some(channel))
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool sender enforcement failed while scanning {} accounts: {}",
                channel, error
            ),
            retryable: false,
        })?;
    let target = normalize_person_name(operator_name);
    if target.is_empty() {
        return Ok(None);
    }
    for account in all_channel_accounts {
        let display = account
            .display_name
            .replace(" (EMAIL)", "")
            .replace(" (SMS)", "")
            .replace(" (CHAT)", "");
        if normalize_person_name(&display) == target {
            return Ok(Some(account.operator_id));
        }
    }
    Ok(None)
}

fn ensure_operator_channel_account(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    operator_id: &str,
    operator_name: &str,
    channel: &str,
) -> Result<app_persistence::CommsAccountRecord, agent_core::models::run::RunError> {
    let normalized_channel = channel.trim().to_ascii_lowercase();
    let account_id = format!("acct_{}_{}", normalized_channel, operator_id.trim());
    let safe_name = if operator_name.trim().is_empty() {
        "Operator".to_string()
    } else {
        operator_name.trim().to_string()
    };
    let display_name = format!("{} ({})", safe_name, normalized_channel.to_ascii_uppercase());
    let address = match normalized_channel.as_str() {
        "email" => format!(
            "{}@agentdeck.io",
            normalize_person_name(&safe_name).replace(' ', ".")
        ),
        "chat" => format!("@{}", normalize_person_name(&safe_name).replace(' ', ".")),
        "sms" => String::new(),
        _ => String::new(),
    };

    state_store
        .upsert_comms_account(
            workspace_id,
            account_id.as_str(),
            operator_id.trim(),
            normalized_channel.as_str(),
            address.as_str(),
            display_name.as_str(),
            Some("active"),
        )
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "Current operator has no {} account configured and auto-provision failed: {}",
                normalized_channel, error
            ),
            retryable: false,
        })
}

fn normalize_person_name(value: &str) -> String {
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

fn ensure_selector_object_mut(
    op: &mut serde_json::Value,
) -> Option<&mut serde_json::Map<String, serde_json::Value>> {
    if op.get("selector").is_none() {
        let map = op.as_object_mut()?;
        map.insert(
            "selector".to_string(),
            serde_json::Value::Object(serde_json::Map::new()),
        );
    }
    op.get_mut("selector").and_then(|value| value.as_object_mut())
}

fn assert_thread_owned_by_operator(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    thread_id: &str,
    operator_id: &str,
    operator_name: &str,
) -> Result<(), agent_core::models::run::RunError> {
    let Some(thread) = state_store
        .get_comms_thread(workspace_id, thread_id)
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool read scope failed while loading thread {}: {}",
                thread_id, error
            ),
            retryable: false,
        })?
    else {
        return Err(agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!("comms_tool read requires an existing threadId (not found: {})", thread_id),
            retryable: false,
        });
    };

    let mut allowed_account_ids = collect_operator_account_ids(state_store, workspace_id, operator_id)?;
    if let Some(mapped_operator_id) = resolve_operator_id_by_display_name(
        state_store,
        workspace_id,
        &thread.channel,
        operator_name,
    )? {
        allowed_account_ids.extend(collect_operator_account_ids(
            state_store,
            workspace_id,
            mapped_operator_id.as_str(),
        )?);
    }

    if allowed_account_ids.contains(&thread.account_id) {
        return Ok(());
    }

    Err(agent_core::models::run::RunError {
        code: "tool_permission_denied".to_string(),
        message: "comms_tool read denied: thread is not owned by current operator mailbox.".to_string(),
        retryable: false,
    })
}

fn collect_operator_account_ids(
    state_store: &PersistenceStateStore,
    workspace_id: &str,
    operator_id: &str,
) -> Result<HashSet<String>, agent_core::models::run::RunError> {
    let accounts = state_store
        .list_comms_accounts(workspace_id, Some(operator_id), None)
        .map_err(|error| agent_core::models::run::RunError {
            code: "tool_invalid_args".to_string(),
            message: format!(
                "comms_tool account scope failed while loading accounts for operator {}: {}",
                operator_id, error
            ),
            retryable: false,
        })?;
    Ok(accounts.into_iter().map(|value| value.account_id).collect())
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
