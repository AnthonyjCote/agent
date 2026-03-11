use std::collections::{HashMap, HashSet};

use app_domain_comms::delivery_policy::{
    CommsDeliveryAdapter as DomainCommsDeliveryAdapter,
    CommsDeliveryService as DomainCommsDeliveryService,
    SendChatInput,
    SendEmailInput,
    SendSmsInput,
};
use app_domains_core::errors::DomainError;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{CommsMessageRecord, PersistenceError, PersistenceStateStore};

#[derive(Debug, Clone)]
pub struct CommsDeliveryService {
    domain_service: DomainCommsDeliveryService,
    adapter: PersistenceCommsDeliveryAdapter,
}

#[derive(Debug, Clone)]
struct PersistenceCommsDeliveryAdapter {
    store: PersistenceStateStore,
    sandbox_email_adapter: SandboxEmailAdapter,
    sandbox_sms_adapter: SandboxSmsAdapter,
}

impl CommsDeliveryService {
    pub fn new_from_env(store: PersistenceStateStore) -> Self {
        Self {
            domain_service: DomainCommsDeliveryService::new_from_env(),
            adapter: PersistenceCommsDeliveryAdapter {
                store,
                sandbox_email_adapter: SandboxEmailAdapter::default(),
                sandbox_sms_adapter: SandboxSmsAdapter::default(),
            },
        }
    }

    pub fn send_email(
        &self,
        workspace_id: &str,
        input: SendEmailInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let payload = self
            .domain_service
            .send_email(&self.adapter, workspace_id, input)
            .map_err(domain_error_to_persistence)?;
        to_message_record(payload)
    }

    pub fn send_sms(
        &self,
        workspace_id: &str,
        input: SendSmsInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let payload = self
            .domain_service
            .send_sms(&self.adapter, workspace_id, input)
            .map_err(domain_error_to_persistence)?;
        to_message_record(payload)
    }

    pub fn send_chat(
        &self,
        workspace_id: &str,
        input: SendChatInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let payload = self
            .domain_service
            .send_chat(&self.adapter, workspace_id, input)
            .map_err(domain_error_to_persistence)?;
        to_message_record(payload)
    }
}

impl DomainCommsDeliveryAdapter for PersistenceCommsDeliveryAdapter {
    fn send_email(&self, workspace_id: &str, input: SendEmailInput) -> app_domains_core::DomainResult<Value> {
        let message = self
            .sandbox_email_adapter
            .send_email(&self.store, workspace_id, input)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        serde_json::to_value(message).map_err(|error| DomainError::Internal(error.to_string()))
    }

    fn send_sms(&self, workspace_id: &str, input: SendSmsInput) -> app_domains_core::DomainResult<Value> {
        let message = self
            .sandbox_sms_adapter
            .send_sms(&self.store, workspace_id, input)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        serde_json::to_value(message).map_err(|error| DomainError::Internal(error.to_string()))
    }

    fn send_chat(&self, workspace_id: &str, input: SendChatInput) -> app_domains_core::DomainResult<Value> {
        let message = self
            .send_chat_internal(workspace_id, input)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        serde_json::to_value(message).map_err(|error| DomainError::Internal(error.to_string()))
    }
}

fn domain_error_to_persistence(error: DomainError) -> PersistenceError {
    PersistenceError::Io {
        context: "Comms delivery domain operation failed",
        source: std::io::Error::new(std::io::ErrorKind::Other, error.to_string()),
        path: None,
    }
}

fn to_message_record(payload: Value) -> Result<CommsMessageRecord, PersistenceError> {
    serde_json::from_value(payload).map_err(|error| PersistenceError::JsonParse {
        context: "Failed to parse comms delivery message payload",
        source: error,
        path: None,
    })
}

impl PersistenceCommsDeliveryAdapter {
    fn send_chat_internal(
        &self,
        workspace_id: &str,
        input: SendChatInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let sender_thread = self.store
            .get_comms_thread(workspace_id, &input.thread_id)?
            .ok_or_else(|| PersistenceError::Sql {
                context: "Sender comms thread not found for chat transport",
                source: rusqlite::Error::QueryReturnedNoRows,
                path: None,
            })?;
        let sender_account = self.store.get_comms_account_by_address(
            workspace_id,
            "chat",
            &input.from_account_ref,
        )?;

        if sender_thread.channel != "chat" {
            return self.store.append_comms_message(
                workspace_id,
                &input.thread_id,
                "outbound",
                &input.from_account_ref,
                input.to_participants.as_ref(),
                None,
                None,
                None,
                &input.body_text,
                input.reply_to_message_id.as_deref(),
            );
        }

        let sender_message = self.store.append_comms_message(
            workspace_id,
            &input.thread_id,
            "outbound",
            &input.from_account_ref,
            input.to_participants.as_ref(),
            None,
            None,
            None,
            &input.body_text,
            input.reply_to_message_id.as_deref(),
        )?;

        let mut recipients = extract_addresses(input.to_participants.as_ref());
        recipients.retain(|address| !address.eq_ignore_ascii_case(&input.from_account_ref));
        recipients.sort();
        recipients.dedup();

        let mut participants_for_key = recipients.clone();
        participants_for_key.push(input.from_account_ref.clone());
        participants_for_key.sort();
        participants_for_key.dedup();

        let thread_key = if !sender_thread.thread_key.trim().is_empty() {
            sender_thread.thread_key.clone()
        } else {
            chat_thread_key(&participants_for_key)
        };
        if sender_thread.thread_key.trim().is_empty() {
            self.store.update_comms_thread_thread_key(workspace_id, &sender_thread.thread_id, &thread_key)?;
        }

        for recipient in recipients {
            let Some(account) = self.store.get_comms_account_by_address(workspace_id, "chat", &recipient)? else {
                self.store.insert_comms_delivery_event(
                    workspace_id,
                    &sender_message.message_id,
                    &sender_message.thread_id,
                    "failed",
                    Some("unresolved_internal_address"),
                    Some(&format!("No internal chat account for recipient address {}", recipient)),
                )?;
                continue;
            };

            let recipient_thread = match self.store.find_latest_comms_thread_by_thread_key(
                workspace_id,
                "chat",
                &account.account_id,
                &thread_key,
            )? {
                Some(thread) => thread,
                None => {
                    let recipient_title = if is_dm_thread(&sender_thread.participants) {
                        sender_account
                            .as_ref()
                            .map(|value| value.display_name.replace(" (CHAT)", ""))
                            .unwrap_or_else(|| input.from_account_ref.clone())
                    } else {
                        sender_thread.title.clone()
                    };
                    let created = self.store.create_comms_thread(
                        workspace_id,
                        "chat",
                        &account.account_id,
                        Some(&recipient_title),
                        None,
                        Some(&sender_thread.participants),
                        Some("inbox"),
                    )?;
                    self.store.update_comms_thread_thread_key(
                        workspace_id,
                        &created.thread_id,
                        &thread_key,
                    )?;
                    self.store
                        .get_comms_thread(workspace_id, &created.thread_id)?
                        .ok_or_else(|| PersistenceError::Sql {
                            context: "Chat recipient thread not found after create",
                            source: rusqlite::Error::QueryReturnedNoRows,
                            path: None,
                        })?
                }
            };

            self.store.append_comms_message(
                workspace_id,
                &recipient_thread.thread_id,
                "inbound",
                &input.from_account_ref,
                Some(&json!([account.address])),
                None,
                None,
                None,
                &input.body_text,
                input.reply_to_message_id.as_deref(),
            )?;
        }

        self.store.insert_comms_delivery_event(
            workspace_id,
            &sender_message.message_id,
            &sender_message.thread_id,
            "delivered",
            None,
            None,
        )?;

        Ok(sender_message)
    }
}

trait EmailTransportAdapter {
    fn send_email(
        &self,
        store: &PersistenceStateStore,
        workspace_id: &str,
        input: SendEmailInput,
    ) -> Result<CommsMessageRecord, PersistenceError>;
}

#[derive(Debug, Clone, Default)]
struct SandboxEmailAdapter;
#[derive(Debug, Clone, Default)]
struct SandboxSmsAdapter;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgSnapshotEnvelope {
    snapshot: OrgSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgSnapshot {
    #[serde(default)]
    business_units: Vec<SnapshotBusinessUnit>,
    #[serde(default)]
    org_units: Vec<SnapshotOrgUnit>,
    #[serde(default)]
    operators: Vec<SnapshotOperator>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotBusinessUnit {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotOrgUnit {
    id: String,
    #[serde(default)]
    parent_org_unit_id: Option<String>,
    #[serde(default)]
    business_unit_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotOperator {
    id: String,
    name: String,
    org_unit_id: String,
}

impl EmailTransportAdapter for SandboxEmailAdapter {
    fn send_email(
        &self,
        store: &PersistenceStateStore,
        workspace_id: &str,
        input: SendEmailInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let sender_thread = store
            .get_comms_thread(workspace_id, &input.thread_id)?
            .ok_or_else(|| PersistenceError::Sql {
                context: "Sender comms thread not found for email transport",
                source: rusqlite::Error::QueryReturnedNoRows,
                path: None,
            })?;

        if sender_thread.channel != "email" {
            return store.append_comms_message(
                workspace_id,
                &input.thread_id,
                "outbound",
                &input.from_account_ref,
                input.to_participants.as_ref(),
                input.cc_participants.as_ref(),
                input.bcc_participants.as_ref(),
                input.subject.as_deref(),
                &input.body_text,
                input.reply_to_message_id.as_deref(),
            );
        }

        let sender_message = store.append_comms_message(
            workspace_id,
            &input.thread_id,
            "outbound",
            &input.from_account_ref,
            input.to_participants.as_ref(),
            input.cc_participants.as_ref(),
            input.bcc_participants.as_ref(),
            input.subject.as_deref(),
            &input.body_text,
            input.reply_to_message_id.as_deref(),
        )?;

        let mut recipient_addresses = Vec::new();
        recipient_addresses.extend(extract_addresses(input.to_participants.as_ref()));
        recipient_addresses.extend(extract_addresses(input.cc_participants.as_ref()));
        recipient_addresses.extend(extract_addresses(input.bcc_participants.as_ref()));

        let mut delivered_addresses = HashSet::new();
        let canonical_subject = input
            .subject
            .as_deref()
            .map(|value| value.trim())
            .unwrap_or_default();

        for address in recipient_addresses {
            let normalized = address.trim().to_lowercase();
            if normalized.is_empty() || delivered_addresses.contains(&normalized) {
                continue;
            }
            delivered_addresses.insert(normalized.clone());

            let resolved_account = match store.get_comms_account_by_address(
                workspace_id,
                "email",
                &normalized,
            )? {
                Some(account) => Some(account),
                None => {
                    if let Some((operator_id, operator_name)) =
                        resolve_internal_operator_for_email(store, workspace_id, &normalized)?
                    {
                        Some(store.upsert_comms_account(
                            workspace_id,
                            &format!("acct_email_{}", operator_id.trim()),
                            operator_id.trim(),
                            "email",
                            &normalized,
                            &format!("{} (EMAIL)", operator_name.trim()),
                            Some("active"),
                        )?)
                    } else {
                        None
                    }
                }
            };

            let Some(account) = resolved_account else {
                store.insert_comms_delivery_event(
                    workspace_id,
                    &sender_message.message_id,
                    &sender_message.thread_id,
                    "failed",
                    Some("unresolved_internal_address"),
                    Some(&format!("No internal account for recipient address {}", normalized)),
                )?;
                continue;
            };

            let recipient_thread = match store.find_latest_comms_thread_by_subject(
                workspace_id,
                "email",
                &account.account_id,
                "inbox",
                canonical_subject,
            )? {
                Some(thread) => thread,
                None => store.create_comms_thread(
                    workspace_id,
                    "email",
                    &account.account_id,
                    Some(canonical_subject),
                    Some(canonical_subject),
                    Some(&json!({
                        "from": input.from_account_ref,
                        "to": input.to_participants.clone().unwrap_or_else(|| json!([]))
                    })),
                    Some("inbox"),
                )?,
            };

            store.append_comms_message(
                workspace_id,
                &recipient_thread.thread_id,
                "inbound",
                &input.from_account_ref,
                input.to_participants.as_ref(),
                input.cc_participants.as_ref(),
                input.bcc_participants.as_ref(),
                input.subject.as_deref(),
                &input.body_text,
                input.reply_to_message_id.as_deref(),
            )?;

            store.insert_comms_delivery_event(
                workspace_id,
                &sender_message.message_id,
                &sender_message.thread_id,
                "delivered",
                None,
                None,
            )?;
        }

        Ok(sender_message)
    }
}

impl SandboxSmsAdapter {
    fn send_sms(
        &self,
        store: &PersistenceStateStore,
        workspace_id: &str,
        input: SendSmsInput,
    ) -> Result<CommsMessageRecord, PersistenceError> {
        let sender_account = store
            .get_comms_account_by_address(workspace_id, "sms", &input.from_account_ref)?
            .ok_or_else(|| PersistenceError::Sql {
                context: "Sender sms account not found for sms transport",
                source: rusqlite::Error::QueryReturnedNoRows,
                path: None,
            })?;

        let recipients = extract_addresses(input.to_participants.as_ref());
        let peer_number = recipients
            .first()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| PersistenceError::Io {
                context: "Missing sms recipient number",
                source: std::io::Error::new(std::io::ErrorKind::InvalidInput, "toParticipants is empty"),
                path: None,
            })?;

        let sender_thread_key = sms_thread_key(&peer_number);
        let requested_thread = store.get_comms_thread(workspace_id, &input.thread_id)?;
        let sender_thread = if let Some(thread) = requested_thread {
            if thread.channel == "sms" && thread.account_id == sender_account.account_id {
                if thread.thread_key.trim() != sender_thread_key {
                    store.update_comms_thread_thread_key(
                        workspace_id,
                        &thread.thread_id,
                        &sender_thread_key,
                    )?;
                }
                thread
            } else {
                match store.find_latest_comms_thread_by_thread_key(
                    workspace_id,
                    "sms",
                    &sender_account.account_id,
                    &sender_thread_key,
                )? {
                    Some(found) => found,
                    None => {
                        let created = store.create_comms_thread(
                            workspace_id,
                            "sms",
                            &sender_account.account_id,
                            Some(&peer_number),
                            None,
                            Some(&json!({
                                "peerNumber": peer_number
                            })),
                            Some("inbox"),
                        )?;
                        store.update_comms_thread_thread_key(
                            workspace_id,
                            &created.thread_id,
                            &sender_thread_key,
                        )?;
                        store
                            .get_comms_thread(workspace_id, &created.thread_id)?
                            .ok_or_else(|| PersistenceError::Sql {
                                context: "SMS sender thread not found after create",
                                source: rusqlite::Error::QueryReturnedNoRows,
                                path: None,
                            })?
                    }
                }
            }
        } else {
            match store.find_latest_comms_thread_by_thread_key(
                workspace_id,
                "sms",
                &sender_account.account_id,
                &sender_thread_key,
            )? {
                Some(found) => found,
                None => {
                    let created = store.create_comms_thread(
                        workspace_id,
                        "sms",
                        &sender_account.account_id,
                        Some(&peer_number),
                        None,
                        Some(&json!({
                            "peerNumber": peer_number
                        })),
                        Some("inbox"),
                    )?;
                    store.update_comms_thread_thread_key(
                        workspace_id,
                        &created.thread_id,
                        &sender_thread_key,
                    )?;
                    store
                        .get_comms_thread(workspace_id, &created.thread_id)?
                        .ok_or_else(|| PersistenceError::Sql {
                            context: "SMS sender thread not found after create",
                            source: rusqlite::Error::QueryReturnedNoRows,
                            path: None,
                        })?
                }
            }
        };

        let sender_message = store.append_comms_message(
            workspace_id,
            &sender_thread.thread_id,
            "outbound",
            &sender_account.address,
            Some(&json!([peer_number])),
            None,
            None,
            None,
            &input.body_text,
            input.reply_to_message_id.as_deref(),
        )?;

        let recipient_account = store
            .get_comms_account_by_address(workspace_id, "sms", &peer_number)?;
        let Some(recipient_account) = recipient_account else {
            store.insert_comms_delivery_event(
                workspace_id,
                &sender_message.message_id,
                &sender_message.thread_id,
                "failed",
                Some("unresolved_internal_number"),
                Some(&format!("No internal sms account for recipient number {}", peer_number)),
            )?;
            return Ok(sender_message);
        };

        let recipient_thread_key = sms_thread_key(&sender_account.address);
        let sender_display_name = sender_account
            .display_name
            .replace(" (SMS)", "")
            .trim()
            .to_string();
        let recipient_title = if sender_display_name.is_empty() {
            sender_account.address.clone()
        } else {
            format!("{} <{}>", sender_display_name, sender_account.address)
        };
        let recipient_thread = match store.find_latest_comms_thread_by_thread_key(
            workspace_id,
            "sms",
            &recipient_account.account_id,
            &recipient_thread_key,
        )? {
            Some(thread) => {
                if thread.title != recipient_title {
                    let _ = store.update_comms_thread(
                        workspace_id,
                        &thread.thread_id,
                        Some(&recipient_title),
                        None,
                        None,
                        None,
                    )?;
                }
                thread
            }
            None => {
                let created = store.create_comms_thread(
                    workspace_id,
                    "sms",
                    &recipient_account.account_id,
                    Some(&recipient_title),
                    None,
                    Some(&json!({
                        "peerNumber": sender_account.address
                    })),
                    Some("inbox"),
                )?;
                store.update_comms_thread_thread_key(
                    workspace_id,
                    &created.thread_id,
                    &recipient_thread_key,
                )?;
                store
                    .get_comms_thread(workspace_id, &created.thread_id)?
                    .ok_or_else(|| PersistenceError::Sql {
                        context: "SMS recipient thread not found after create",
                        source: rusqlite::Error::QueryReturnedNoRows,
                        path: None,
                    })?
            }
        };

        store.append_comms_message(
            workspace_id,
            &recipient_thread.thread_id,
            "inbound",
            &sender_account.address,
            Some(&json!([recipient_account.address])),
            None,
            None,
            None,
            &input.body_text,
            input.reply_to_message_id.as_deref(),
        )?;

        store.insert_comms_delivery_event(
            workspace_id,
            &sender_message.message_id,
            &sender_message.thread_id,
            "delivered",
            None,
            None,
        )?;
        Ok(sender_message)
    }
}

fn sms_thread_key(peer_number: &str) -> String {
    format!("sms:peer:{}", peer_number.trim().to_lowercase())
}

fn chat_thread_key(participants: &[String]) -> String {
    let normalized = participants
        .iter()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("|");
    format!("chat:{}", normalized)
}

fn is_dm_thread(participants: &Value) -> bool {
    participants
        .as_object()
        .and_then(|value| value.get("kind"))
        .and_then(|value| value.as_str())
        .map(|value| value == "dm")
        .unwrap_or(false)
}

fn extract_addresses(value: Option<&Value>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    match value {
        Value::String(single) => vec![single.trim().to_string()],
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(address) => Some(address.trim().to_string()),
                Value::Object(object) => object
                    .get("email")
                    .and_then(|value| value.as_str())
                    .or_else(|| object.get("address").and_then(|value| value.as_str()))
                    .map(|address| address.trim().to_string()),
                _ => None,
            })
            .filter(|address| !address.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn resolve_internal_operator_for_email(
    store: &PersistenceStateStore,
    workspace_id: &str,
    address: &str,
) -> Result<Option<(String, String)>, PersistenceError> {
    let Some(state) = store.get_org_chart_state(workspace_id)? else {
        return Ok(None);
    };

    let parsed = serde_json::from_value::<OrgSnapshotEnvelope>(state.snapshot).ok();
    let Some(snapshot_envelope) = parsed else {
        return Ok(None);
    };
    let snapshot = snapshot_envelope.snapshot;

    let org_by_id: HashMap<String, SnapshotOrgUnit> = snapshot
        .org_units
        .into_iter()
        .map(|org_unit| (org_unit.id.clone(), org_unit))
        .collect();
    let bu_by_id: HashMap<String, String> = snapshot
        .business_units
        .into_iter()
        .map(|business_unit| (business_unit.id, business_unit.name))
        .collect();

    for operator in snapshot.operators {
        let business_unit_name = resolve_business_unit_name(&org_by_id, &bu_by_id, &operator.org_unit_id)
            .unwrap_or_else(|| "local.agentdeck".to_string());
        let generated = build_operator_email_address(&operator.name, &business_unit_name);
        if generated.eq_ignore_ascii_case(address) {
            return Ok(Some((operator.id, operator.name)));
        }
    }

    Ok(None)
}

fn resolve_business_unit_name(
    org_by_id: &HashMap<String, SnapshotOrgUnit>,
    bu_by_id: &HashMap<String, String>,
    org_unit_id: &str,
) -> Option<String> {
    let mut cursor = org_by_id.get(org_unit_id);
    while let Some(org_unit) = cursor {
        if let Some(business_unit_id) = &org_unit.business_unit_id {
            if let Some(name) = bu_by_id.get(business_unit_id) {
                return Some(name.clone());
            }
        }
        cursor = org_unit
            .parent_org_unit_id
            .as_ref()
            .and_then(|parent| org_by_id.get(parent));
    }
    None
}

fn normalize_local_part(value: &str) -> String {
    let mut normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '.' })
        .collect::<String>();
    while normalized.contains("..") {
        normalized = normalized.replace("..", ".");
    }
    normalized.trim_matches('.').to_string()
}

fn normalize_domain_part(value: &str) -> String {
    let mut normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' {
                ch
            } else {
                '.'
            }
        })
        .collect::<String>();
    while normalized.contains("..") {
        normalized = normalized.replace("..", ".");
    }
    normalized.trim_matches('.').to_string()
}

fn build_operator_email_address(operator_name: &str, business_unit_name: &str) -> String {
    let parts = operator_name
        .split_whitespace()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let local_raw = if parts.len() >= 2 {
        format!("{}.{}", parts[0], parts[1])
    } else if let Some(single) = parts.first() {
        format!("{}.{}", single, "operator")
    } else {
        "operator.operator".to_string()
    };
    let local = normalize_local_part(&local_raw);
    let domain = normalize_domain_part(business_unit_name);
    let local_final = if local.is_empty() {
        "operator.operator".to_string()
    } else {
        local
    };
    let domain_final = if domain.is_empty() {
        "local.agentdeck".to_string()
    } else {
        domain
    };
    format!("{}@{}", local_final, domain_final)
}
