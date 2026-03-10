use app_domains_core::{errors::DomainError, DomainResult};

use crate::models::{CommsChannel, OutboundMessageDraft};

#[derive(Default)]
pub struct CommsDomainService;

impl CommsDomainService {
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
