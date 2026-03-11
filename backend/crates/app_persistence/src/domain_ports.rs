use app_domain_comms::{
    ports::{CommsToolExecutionOutput, CommsToolPort, CommsToolStore},
    CommsDomainService,
};
use app_domain_org::ports::{OrgChartStateRecord as DomainOrgChartStateRecord, OrgToolStore};
use app_domains_core::{errors::DomainError, DomainResult};
use serde_json::Value;

use crate::PersistenceStateStore;

#[derive(Clone)]
pub struct PersistenceOrgToolPort {
    store: PersistenceStateStore,
    workspace_id: String,
}

impl PersistenceOrgToolPort {
    pub fn new(store: PersistenceStateStore, workspace_id: impl Into<String>) -> Self {
        Self {
            store,
            workspace_id: workspace_id.into(),
        }
    }
}

impl OrgToolStore for PersistenceOrgToolPort {
    fn load_org_chart_state(&self) -> DomainResult<Option<DomainOrgChartStateRecord>> {
        let state = self
            .store
            .get_org_chart_state(&self.workspace_id)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Ok(state.map(|value| DomainOrgChartStateRecord {
            snapshot: value.snapshot,
            activity_events: value.activity_events,
            command_history: value.command_history,
            history_cursor: value.history_cursor,
        }))
    }

    fn save_org_chart_state(&self, state: &DomainOrgChartStateRecord) -> DomainResult<()> {
        self.store
            .save_org_chart_state(
                &self.workspace_id,
                &crate::state::OrgChartStateRecord {
                    snapshot: state.snapshot.clone(),
                    activity_events: state.activity_events.clone(),
                    command_history: state.command_history.clone(),
                    history_cursor: state.history_cursor,
                },
            )
            .map_err(|error| DomainError::Internal(error.to_string()))
    }

    fn list_agent_manifests(&self) -> DomainResult<Vec<serde_json::Value>> {
        self.store
            .list_agent_manifests(&self.workspace_id)
            .map_err(|error| DomainError::Internal(error.to_string()))
    }

    fn replace_agent_manifests(&self, manifests: &[serde_json::Value]) -> DomainResult<()> {
        self.store
            .replace_agent_manifests(&self.workspace_id, manifests)
            .map_err(|error| DomainError::Internal(error.to_string()))
    }
}

#[derive(Clone)]
pub struct PersistenceCommsToolPort {
    store: PersistenceStateStore,
    workspace_id: String,
}

impl PersistenceCommsToolPort {
    pub fn new(store: PersistenceStateStore, workspace_id: impl Into<String>) -> Self {
        Self {
            store,
            workspace_id: workspace_id.into(),
        }
    }

    fn to_json<T: serde::Serialize>(value: T) -> DomainResult<serde_json::Value> {
        serde_json::to_value(value).map_err(|error| DomainError::Internal(error.to_string()))
    }

    fn extract_addresses(value: Option<&Value>) -> Vec<String> {
        let Some(value) = value else {
            return Vec::new();
        };
        match value {
            Value::String(single) => vec![single.trim().to_string()],
            Value::Array(items) => items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect(),
            _ => Vec::new(),
        }
    }
}

impl CommsToolStore for PersistenceCommsToolPort {
    fn get_account(&self, account_id: &str) -> DomainResult<Option<serde_json::Value>> {
        let account = self
            .store
            .get_comms_account(&self.workspace_id, account_id)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        account
            .map(Self::to_json)
            .transpose()
    }

    fn list_accounts(&self, operator_id: Option<&str>, channel: Option<&str>) -> DomainResult<Vec<serde_json::Value>> {
        let records = self
            .store
            .list_comms_accounts(&self.workspace_id, operator_id, channel)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        records
            .into_iter()
            .map(Self::to_json)
            .collect()
    }

    fn get_thread(&self, thread_id: &str) -> DomainResult<Option<serde_json::Value>> {
        let thread = self
            .store
            .get_comms_thread(&self.workspace_id, thread_id)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        thread
            .map(Self::to_json)
            .transpose()
    }

    fn list_threads(
        &self,
        channel: Option<&str>,
        account_id: Option<&str>,
        folder: Option<&str>,
        search: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<serde_json::Value>> {
        let records = self
            .store
            .list_comms_threads(
                &self.workspace_id,
                channel,
                account_id,
                folder,
                search,
                limit,
                offset,
            )
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        records
            .into_iter()
            .map(Self::to_json)
            .collect()
    }

    fn list_messages(&self, thread_id: &str, limit: i64, offset: i64) -> DomainResult<Vec<serde_json::Value>> {
        let records = self
            .store
            .list_comms_messages(&self.workspace_id, thread_id, limit, offset)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        records
            .into_iter()
            .map(Self::to_json)
            .collect()
    }

    fn get_message(&self, thread_id: &str, message_id: &str) -> DomainResult<Option<serde_json::Value>> {
        let message = self
            .store
            .get_comms_message(&self.workspace_id, thread_id, message_id)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        message
            .map(Self::to_json)
            .transpose()
    }

    fn upsert_account(
        &self,
        account_id: &str,
        operator_id: &str,
        channel: &str,
        address: &str,
        display_name: &str,
        status: Option<&str>,
    ) -> DomainResult<serde_json::Value> {
        let record = self
            .store
            .upsert_comms_account(
                &self.workspace_id,
                account_id,
                operator_id,
                channel,
                address,
                display_name,
                status,
            )
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Self::to_json(record)
    }

    fn create_thread(
        &self,
        channel: &str,
        account_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        participants: Option<&serde_json::Value>,
        folder: Option<&str>,
    ) -> DomainResult<serde_json::Value> {
        let record = self
            .store
            .create_comms_thread(
                &self.workspace_id,
                channel,
                account_id,
                title,
                subject,
                participants,
                folder,
            )
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Self::to_json(record)
    }

    fn append_message(
        &self,
        thread_id: &str,
        direction: &str,
        from_account_ref: &str,
        to_participants: Option<&serde_json::Value>,
        cc_participants: Option<&serde_json::Value>,
        bcc_participants: Option<&serde_json::Value>,
        subject: Option<&str>,
        body_text: &str,
        reply_to_message_id: Option<&str>,
    ) -> DomainResult<serde_json::Value> {
        let record = self
            .store
            .append_comms_message(
                &self.workspace_id,
                thread_id,
                direction,
                from_account_ref,
                to_participants,
                cc_participants,
                bcc_participants,
                subject,
                body_text,
                reply_to_message_id,
            )
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        Self::to_json(record)
    }

    fn send_outbound_message(
        &self,
        channel: &str,
        thread_id: Option<&str>,
        from_account_ref: &str,
        to_participants: Option<&Value>,
        cc_participants: Option<&Value>,
        bcc_participants: Option<&Value>,
        subject: Option<&str>,
        body_text: &str,
        reply_to_message_id: Option<&str>,
    ) -> DomainResult<Value> {
        let normalized_channel = channel.trim().to_ascii_lowercase();
        let sender_account = self
            .store
            .get_comms_account_by_address(&self.workspace_id, &normalized_channel, from_account_ref)
            .map_err(|error| DomainError::Internal(error.to_string()))?
            .ok_or_else(|| {
                DomainError::InvalidInput(format!(
                    "Sender account not found for channel={} fromAccountRef={}",
                    normalized_channel, from_account_ref
                ))
            })?;

        let resolved_thread_id = {
            let provided = thread_id
                .map(str::trim)
                .filter(|value| !value.is_empty() && !value.eq_ignore_ascii_case("new"))
                .map(ToOwned::to_owned);
            if let Some(value) = provided {
                value
            } else {
                let title = Self::extract_addresses(to_participants)
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Outbound".to_string());
                let participants = match normalized_channel.as_str() {
                    "sms" => {
                        let peer = Self::extract_addresses(to_participants)
                            .first()
                            .cloned()
                            .unwrap_or_default();
                        if peer.is_empty() {
                            None
                        } else {
                            Some(serde_json::json!({ "peerNumber": peer }))
                        }
                    }
                    "chat" => Some(serde_json::json!({
                        "kind": "dm",
                        "memberAddresses": Self::extract_addresses(to_participants)
                    })),
                    _ => None,
                };
                let folder = if normalized_channel == "email" {
                    "sent"
                } else {
                    "inbox"
                };
                let thread = self
                    .store
                    .create_comms_thread(
                        &self.workspace_id,
                        &normalized_channel,
                        &sender_account.account_id,
                        Some(title.as_str()),
                        subject,
                        participants.as_ref(),
                        Some(folder),
                    )
                    .map_err(|error| DomainError::Internal(error.to_string()))?;
                thread.thread_id
            }
        };

        let delivery = crate::CommsDeliveryService::new_from_env(self.store.clone());
        let message = match normalized_channel.as_str() {
            "email" => delivery
                .send_email(
                    &self.workspace_id,
                    crate::SendEmailInput {
                        thread_id: resolved_thread_id,
                        from_account_ref: from_account_ref.to_string(),
                        to_participants: to_participants.cloned(),
                        cc_participants: cc_participants.cloned(),
                        bcc_participants: bcc_participants.cloned(),
                        subject: subject.map(ToOwned::to_owned),
                        body_text: body_text.to_string(),
                        reply_to_message_id: reply_to_message_id.map(ToOwned::to_owned),
                    },
                )
                .map_err(|error| DomainError::Internal(error.to_string()))?,
            "sms" => delivery
                .send_sms(
                    &self.workspace_id,
                    crate::SendSmsInput {
                        thread_id: resolved_thread_id,
                        from_account_ref: from_account_ref.to_string(),
                        to_participants: to_participants.cloned(),
                        body_text: body_text.to_string(),
                        reply_to_message_id: reply_to_message_id.map(ToOwned::to_owned),
                    },
                )
                .map_err(|error| DomainError::Internal(error.to_string()))?,
            "chat" => delivery
                .send_chat(
                    &self.workspace_id,
                    crate::SendChatInput {
                        thread_id: resolved_thread_id,
                        from_account_ref: from_account_ref.to_string(),
                        to_participants: to_participants.cloned(),
                        body_text: body_text.to_string(),
                        reply_to_message_id: reply_to_message_id.map(ToOwned::to_owned),
                    },
                )
                .map_err(|error| DomainError::Internal(error.to_string()))?,
            _ => {
                return Err(DomainError::InvalidInput(format!(
                    "Unsupported outbound channel: {}",
                    normalized_channel
                )));
            }
        };
        Self::to_json(message)
    }

    fn update_thread(
        &self,
        thread_id: &str,
        title: Option<&str>,
        subject: Option<&str>,
        status: Option<&str>,
        folder: Option<&str>,
    ) -> DomainResult<Option<serde_json::Value>> {
        let record = self
            .store
            .update_comms_thread(&self.workspace_id, thread_id, title, subject, status, folder)
            .map_err(|error| DomainError::Internal(error.to_string()))?;
        record
            .map(Self::to_json)
            .transpose()
    }

    fn delete_thread(&self, thread_id: &str) -> DomainResult<()> {
        self.store
            .delete_comms_thread(&self.workspace_id, thread_id)
            .map_err(|error| DomainError::Internal(error.to_string()))
    }
}

impl CommsToolPort for PersistenceCommsToolPort {
    fn execute_comms_tool(
        &self,
        args: &serde_json::Value,
    ) -> DomainResult<CommsToolExecutionOutput> {
        CommsDomainService::default().execute_tool_request(self, args)
    }
}
