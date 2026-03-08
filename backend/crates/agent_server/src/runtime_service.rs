use std::{collections::HashMap, sync::Mutex};

use adapter::gemini::model_inference::GeminiCliModelInference;
use agent_persistence::PersistenceStateStore;
use agent_core::{
    models::{
        blocks::MessageBlock,
        run::{RunEvent, RunRequest},
        tool::ToolOutputEnvelope,
    },
    runtime::engine::execute_run_once_with_tools,
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

        let state_store = self.state_store.clone();
        let workspace_id_for_tools = self.workspace_id.clone();
        let events = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut tool_executor = |tool_name: &str, args: &serde_json::Value| -> Result<Option<ToolOutputEnvelope>, agent_core::models::run::RunError> {
                if tool_name != "org_manage_entities_v2" {
                    return Ok(None);
                }
                let output = state_store
                    .execute_org_manage_entities_v2(&workspace_id_for_tools, args)
                    .map_err(|error| agent_core::models::run::RunError {
                        code: "org_manage_tool_failed".to_string(),
                        message: error.to_string(),
                        retryable: false,
                    })?;
                Ok(Some(ToolOutputEnvelope {
                    summary: output.summary,
                    structured_data: Some(output.structured_data),
                    artifacts: Vec::new(),
                    errors: Vec::new(),
                }))
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
