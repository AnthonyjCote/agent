use app_domains_core::{errors::DomainError, DomainResult};

use crate::{
    models::{BusinessUnitSummary, OperatorSummary, OrgUnitSummary},
    ports::{OrgToolExecutionOutput, OrgToolStore},
    tool_orchestration::execute_org_manage_entities_v2,
};

#[derive(Default, Clone)]
pub struct OrgDomainService;

impl OrgDomainService {
    pub fn execute_tool_request(
        &self,
        store: &dyn OrgToolStore,
        args: &serde_json::Value,
    ) -> DomainResult<OrgToolExecutionOutput> {
        execute_org_manage_entities_v2(store, args)
    }

    pub fn validate_business_unit_name(&self, value: &str) -> DomainResult<String> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(DomainError::InvalidInput("business unit name is required".to_string()));
        }
        Ok(trimmed.to_string())
    }

    pub fn summarize_business_unit(&self, name: &str, short_description: &str) -> DomainResult<BusinessUnitSummary> {
        Ok(BusinessUnitSummary {
            name: self.validate_business_unit_name(name)?,
            short_description: short_description.trim().to_string(),
        })
    }

    pub fn summarize_org_unit(&self, name: &str, business_unit_name: Option<&str>) -> DomainResult<OrgUnitSummary> {
        let name = name.trim();
        if name.is_empty() {
            return Err(DomainError::InvalidInput("org unit name is required".to_string()));
        }
        Ok(OrgUnitSummary {
            name: name.to_string(),
            business_unit_name: business_unit_name.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        })
    }

    pub fn summarize_operator(&self, name: &str, title: &str, org_unit_name: Option<&str>) -> DomainResult<OperatorSummary> {
        let clean_name = name.trim();
        let clean_title = title.trim();
        if clean_name.is_empty() {
            return Err(DomainError::InvalidInput("operator name is required".to_string()));
        }
        if clean_title.is_empty() {
            return Err(DomainError::InvalidInput("operator title is required".to_string()));
        }
        Ok(OperatorSummary {
            name: clean_name.to_string(),
            title: clean_title.to_string(),
            org_unit_name: org_unit_name.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        })
    }
}
