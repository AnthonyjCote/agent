use std::env;

use crate::provider_adapter::AdapterReadiness;

pub fn auth_readiness() -> AdapterReadiness {
    if env::var("GEMINI_API_KEY").is_ok() {
        return AdapterReadiness::Ready;
    }

    if env::var("GOOGLE_API_KEY").is_ok() {
        return AdapterReadiness::Ready;
    }

    AdapterReadiness::AuthRequired
}
