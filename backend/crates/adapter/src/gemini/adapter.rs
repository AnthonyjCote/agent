use agent_core::models::run::RunError;

use crate::provider_adapter::{AdapterHealth, AdapterReadiness, ProviderAdapter};

use super::auth_check::auth_readiness;
use super::detect::detect_gemini_cli;

#[derive(Debug, Default)]
pub struct GeminiCliAdapter;

impl ProviderAdapter for GeminiCliAdapter {
    fn provider_name(&self) -> &'static str {
        "gemini_cli"
    }

    fn health(&self) -> Result<AdapterHealth, RunError> {
        if !detect_gemini_cli() {
            return Ok(AdapterHealth {
                provider: self.provider_name().to_string(),
                readiness: AdapterReadiness::MissingCli,
                details: "Install Gemini CLI and ensure it is on PATH".to_string(),
            });
        }

        let auth = auth_readiness();
        if auth != AdapterReadiness::Ready {
            return Ok(AdapterHealth {
                provider: self.provider_name().to_string(),
                readiness: auth,
                details: "Gemini CLI detected but auth is not configured".to_string(),
            });
        }

        Ok(AdapterHealth {
            provider: self.provider_name().to_string(),
            readiness: AdapterReadiness::Ready,
            details: "Gemini CLI detected".to_string(),
        })
    }
}
