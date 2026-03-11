use app_domains_core::{errors::DomainError, DomainResult};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct SendEmailInput {
    pub thread_id: String,
    pub from_account_ref: String,
    pub to_participants: Option<Value>,
    pub cc_participants: Option<Value>,
    pub bcc_participants: Option<Value>,
    pub subject: Option<String>,
    pub body_text: String,
    pub reply_to_message_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SendSmsInput {
    pub thread_id: String,
    pub from_account_ref: String,
    pub to_participants: Option<Value>,
    pub body_text: String,
    pub reply_to_message_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SendChatInput {
    pub thread_id: String,
    pub from_account_ref: String,
    pub to_participants: Option<Value>,
    pub body_text: String,
    pub reply_to_message_id: Option<String>,
}

pub trait CommsDeliveryAdapter {
    fn send_email(&self, workspace_id: &str, input: SendEmailInput) -> DomainResult<Value>;
    fn send_sms(&self, workspace_id: &str, input: SendSmsInput) -> DomainResult<Value>;
    fn send_chat(&self, workspace_id: &str, input: SendChatInput) -> DomainResult<Value>;
}

#[derive(Debug, Clone)]
pub struct CommsDeliveryService {
    email_transport_mode: EmailTransportMode,
    sms_transport_mode: SmsTransportMode,
}

impl Default for CommsDeliveryService {
    fn default() -> Self {
        Self::new_from_env()
    }
}

impl CommsDeliveryService {
    pub fn new_from_env() -> Self {
        let email_mode = std::env::var("COMMS_EMAIL_TRANSPORT")
            .unwrap_or_else(|_| "sandbox".to_string())
            .trim()
            .to_lowercase();
        let sms_mode = std::env::var("COMMS_SMS_TRANSPORT")
            .unwrap_or_else(|_| "sandbox".to_string())
            .trim()
            .to_lowercase();
        let email_transport_mode = match email_mode.as_str() {
            "sandbox" => EmailTransportMode::Sandbox,
            _ => EmailTransportMode::Sandbox,
        };
        let sms_transport_mode = match sms_mode.as_str() {
            "sandbox" => SmsTransportMode::Sandbox,
            _ => SmsTransportMode::Sandbox,
        };
        Self {
            email_transport_mode,
            sms_transport_mode,
        }
    }

    pub fn send_email(
        &self,
        adapter: &dyn CommsDeliveryAdapter,
        workspace_id: &str,
        input: SendEmailInput,
    ) -> DomainResult<Value> {
        match self.email_transport_mode {
            EmailTransportMode::Sandbox => adapter.send_email(workspace_id, input),
        }
    }

    pub fn send_sms(
        &self,
        adapter: &dyn CommsDeliveryAdapter,
        workspace_id: &str,
        input: SendSmsInput,
    ) -> DomainResult<Value> {
        match self.sms_transport_mode {
            SmsTransportMode::Sandbox => adapter.send_sms(workspace_id, input),
        }
    }

    pub fn send_chat(
        &self,
        adapter: &dyn CommsDeliveryAdapter,
        workspace_id: &str,
        input: SendChatInput,
    ) -> DomainResult<Value> {
        adapter.send_chat(workspace_id, input)
    }
}

#[derive(Debug, Clone, Copy)]
enum EmailTransportMode {
    Sandbox,
}

#[derive(Debug, Clone, Copy)]
enum SmsTransportMode {
    Sandbox,
}

pub fn map_domain_error(error: impl ToString) -> DomainError {
    DomainError::Internal(error.to_string())
}
