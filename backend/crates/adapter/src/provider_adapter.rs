use serde::Serialize;

use agent_core::models::run::RunError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AdapterReadiness {
    Ready,
    MissingCli,
    AuthRequired,
    Misconfigured,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterHealth {
    pub provider: String,
    pub readiness: AdapterReadiness,
    pub details: String,
}

pub trait ProviderAdapter {
    fn provider_name(&self) -> &'static str;
    fn health(&self) -> Result<AdapterHealth, RunError>;
}
