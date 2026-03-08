use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{state::OrgChartStateRecord, PersistenceError, PersistenceStateStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgManageExecutionOutput {
    pub summary: String,
    pub structured_data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgManageOperation {
    action: String,
    #[serde(default)]
    payload: Value,
    #[serde(default)]
    client_op_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OrgSnapshot {
    #[serde(default)]
    business_units: Vec<BusinessUnit>,
    #[serde(default)]
    org_units: Vec<OrgUnit>,
    #[serde(default)]
    operators: Vec<Operator>,
    #[serde(default)]
    links: Vec<Link>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BusinessUnit {
    id: String,
    name: String,
    short_description: String,
    parent_business_unit_id: Option<String>,
    logo_source_data_url: String,
    logo_data_url: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgUnit {
    id: String,
    name: String,
    short_description: String,
    parent_org_unit_id: Option<String>,
    business_unit_id: Option<String>,
    icon_source_data_url: String,
    icon_data_url: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Operator {
    id: String,
    source_agent_id: Option<String>,
    name: String,
    title: String,
    primary_objective: String,
    system_directive: String,
    role_brief: String,
    kind: String,
    org_unit_id: String,
    manager_operator_id: Option<String>,
    avatar_source_data_url: String,
    avatar_data_url: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Link {
    id: String,
    from_type: String,
    from_id: String,
    to_type: String,
    to_id: String,
    relation: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentManifest {
    schema_version: String,
    agent_id: String,
    avatar_source_data_url: String,
    avatar_data_url: String,
    name: String,
    role: String,
    primary_objective: String,
    system_directive_short: String,
    tools_policy_ref: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationResult {
    action: String,
    status: String,
    entity_type: Option<String>,
    entity_id: Option<String>,
    message: Option<String>,
    client_op_id: Option<String>,
}

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn now_tag() -> String {
    now_ms().to_string()
}

fn next_id(prefix: &str) -> String {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{}", now_ms(), counter)
}

fn invalid_input(message: impl Into<String>) -> PersistenceError {
    PersistenceError::Io {
        context: "Invalid org_manage_entities_v1 input",
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into()),
        path: None,
    }
}

fn parse_operations(args: &Value) -> Result<Vec<OrgManageOperation>, PersistenceError> {
    if let Some(actions) = args.get("actions").and_then(Value::as_array) {
        let mut out = Vec::new();
        for action in actions {
            let parsed: OrgManageOperation =
                serde_json::from_value(action.clone()).map_err(|error| invalid_input(error.to_string()))?;
            out.push(parsed);
        }
        if out.is_empty() {
            return Err(invalid_input("actions array is empty"));
        }
        return Ok(out);
    }

    let parsed: OrgManageOperation =
        serde_json::from_value(args.clone()).map_err(|error| invalid_input(error.to_string()))?;
    Ok(vec![parsed])
}

fn parse_snapshot(value: &Value) -> OrgSnapshot {
    serde_json::from_value::<OrgSnapshot>(value.clone()).unwrap_or_default()
}

fn has_business_unit(snapshot: &OrgSnapshot, id: &str) -> bool {
    snapshot.business_units.iter().any(|unit| unit.id == id)
}

fn has_org_unit(snapshot: &OrgSnapshot, id: &str) -> bool {
    snapshot.org_units.iter().any(|unit| unit.id == id)
}

fn has_operator(snapshot: &OrgSnapshot, id: &str) -> bool {
    snapshot.operators.iter().any(|operator| operator.id == id)
}

fn ensure_business_unit_parent(snapshot: &OrgSnapshot, id: &Option<String>) -> Result<(), PersistenceError> {
    if let Some(value) = id {
        if !has_business_unit(snapshot, value) {
            return Err(invalid_input(format!("Unknown parent business unit: {}", value)));
        }
    }
    Ok(())
}

fn ensure_org_unit_parent(snapshot: &OrgSnapshot, id: &Option<String>) -> Result<(), PersistenceError> {
    if let Some(value) = id {
        if !has_org_unit(snapshot, value) {
            return Err(invalid_input(format!("Unknown parent org unit: {}", value)));
        }
    }
    Ok(())
}

fn rebuild_links(snapshot: &mut OrgSnapshot) {
    let now = now_tag();
    let mut links = Vec::new();

    for unit in &snapshot.business_units {
        if let Some(parent_id) = unit.parent_business_unit_id.as_deref() {
            links.push(Link {
                id: next_id("lnk"),
                from_type: "business_unit".to_string(),
                from_id: parent_id.to_string(),
                to_type: "business_unit".to_string(),
                to_id: unit.id.clone(),
                relation: "business_unit_parent_of_business_unit".to_string(),
                created_at: now.clone(),
            });
        }
    }

    for unit in &snapshot.org_units {
        if let Some(parent_id) = unit.parent_org_unit_id.as_deref() {
            links.push(Link {
                id: next_id("lnk"),
                from_type: "org_unit".to_string(),
                from_id: parent_id.to_string(),
                to_type: "org_unit".to_string(),
                to_id: unit.id.clone(),
                relation: "org_unit_parent_of_org_unit".to_string(),
                created_at: now.clone(),
            });
        }
        if let Some(business_unit_id) = unit.business_unit_id.as_deref() {
            links.push(Link {
                id: next_id("lnk"),
                from_type: "business_unit".to_string(),
                from_id: business_unit_id.to_string(),
                to_type: "org_unit".to_string(),
                to_id: unit.id.clone(),
                relation: "business_unit_contains_org_unit".to_string(),
                created_at: now.clone(),
            });
        }
    }

    for operator in &snapshot.operators {
        links.push(Link {
            id: next_id("lnk"),
            from_type: "org_unit".to_string(),
            from_id: operator.org_unit_id.clone(),
            to_type: "operator".to_string(),
            to_id: operator.id.clone(),
            relation: "org_unit_contains_operator".to_string(),
            created_at: now.clone(),
        });
        if let Some(manager_id) = operator.manager_operator_id.as_deref() {
            links.push(Link {
                id: next_id("lnk"),
                from_type: "operator".to_string(),
                from_id: manager_id.to_string(),
                to_type: "operator".to_string(),
                to_id: operator.id.clone(),
                relation: "operator_reports_to_operator".to_string(),
                created_at: now.clone(),
            });
        }
    }

    snapshot.links = links;
}

fn create_agent_manifest_for_operator(operator: &Operator) -> AgentManifest {
    AgentManifest {
        schema_version: "1.0".to_string(),
        agent_id: operator
            .source_agent_id
            .clone()
            .unwrap_or_else(|| next_id("agt")),
        avatar_source_data_url: operator.avatar_source_data_url.clone(),
        avatar_data_url: operator.avatar_data_url.clone(),
        name: operator.name.clone(),
        role: operator.title.clone(),
        primary_objective: operator.primary_objective.clone(),
        system_directive_short: operator.system_directive.clone(),
        tools_policy_ref: "policy_default".to_string(),
        created_at: operator.created_at.clone(),
        updated_at: operator.updated_at.clone(),
    }
}

fn upsert_agent_manifest(
    manifests: &mut Vec<Value>,
    operator: &Operator,
) -> Result<(), PersistenceError> {
    let mut manifest = create_agent_manifest_for_operator(operator);
    if manifest.agent_id.trim().is_empty() {
        manifest.agent_id = next_id("agt");
    }
    let payload = serde_json::to_value(&manifest).map_err(|error| PersistenceError::JsonSerialize {
        context: "Failed to serialize agent manifest from org tool operation",
        source: error,
    })?;
    let existing_index = manifests.iter().position(|entry| {
        entry
            .get("agentId")
            .and_then(Value::as_str)
            .map(|value| value == manifest.agent_id)
            .unwrap_or(false)
    });
    if let Some(index) = existing_index {
        manifests[index] = payload;
    } else {
        manifests.push(payload);
    }
    Ok(())
}

fn apply_operation(
    snapshot: &mut OrgSnapshot,
    operation: &OrgManageOperation,
    manifests: &mut Vec<Value>,
) -> Result<OperationResult, PersistenceError> {
    let now = now_tag();
    let action = operation.action.trim().to_string();
    match action.as_str() {
        "read_snapshot" => Ok(OperationResult {
            action,
            status: "ok".to_string(),
            entity_type: None,
            entity_id: None,
            message: Some("snapshot loaded".to_string()),
            client_op_id: operation.client_op_id.clone(),
        }),
        "create_business_unit" => {
            let name = operation
                .payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() {
                return Err(invalid_input("create_business_unit requires payload.name"));
            }
            let parent_business_unit_id = operation
                .payload
                .get("parentBusinessUnitId")
                .and_then(Value::as_str)
                .map(str::to_string);
            ensure_business_unit_parent(snapshot, &parent_business_unit_id)?;
            let sort_order = snapshot
                .business_units
                .iter()
                .filter(|unit| unit.parent_business_unit_id == parent_business_unit_id)
                .map(|unit| unit.sort_order)
                .max()
                .unwrap_or(-1)
                + 1;
            let id = next_id("bu");
            snapshot.business_units.push(BusinessUnit {
                id: id.clone(),
                name,
                short_description: operation
                    .payload
                    .get("shortDescription")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                parent_business_unit_id,
                logo_source_data_url: operation
                    .payload
                    .get("logoSourceDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                logo_data_url: operation
                    .payload
                    .get("logoDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                sort_order,
                created_at: now.clone(),
                updated_at: now,
            });
            Ok(OperationResult {
                action,
                status: "ok".to_string(),
                entity_type: Some("business_unit".to_string()),
                entity_id: Some(id),
                message: Some("Business unit created".to_string()),
                client_op_id: operation.client_op_id.clone(),
            })
        }
        "create_org_unit" => {
            let name = operation
                .payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() {
                return Err(invalid_input("create_org_unit requires payload.name"));
            }
            let parent_org_unit_id = operation
                .payload
                .get("parentOrgUnitId")
                .and_then(Value::as_str)
                .map(str::to_string);
            ensure_org_unit_parent(snapshot, &parent_org_unit_id)?;

            let inherited_business_unit_id = if let Some(parent_id) = parent_org_unit_id.as_deref() {
                snapshot
                    .org_units
                    .iter()
                    .find(|unit| unit.id == parent_id)
                    .and_then(|unit| unit.business_unit_id.clone())
            } else {
                None
            };
            let explicit_business_unit_id = operation
                .payload
                .get("businessUnitId")
                .and_then(Value::as_str)
                .map(str::to_string);
            let business_unit_id = explicit_business_unit_id.or(inherited_business_unit_id);
            ensure_business_unit_parent(snapshot, &business_unit_id)?;

            let sort_order = snapshot
                .org_units
                .iter()
                .filter(|unit| unit.parent_org_unit_id == parent_org_unit_id)
                .map(|unit| unit.sort_order)
                .max()
                .unwrap_or(-1)
                + 1;
            let id = next_id("ou");
            snapshot.org_units.push(OrgUnit {
                id: id.clone(),
                name,
                short_description: operation
                    .payload
                    .get("shortDescription")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                parent_org_unit_id,
                business_unit_id,
                icon_source_data_url: operation
                    .payload
                    .get("iconSourceDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                icon_data_url: operation
                    .payload
                    .get("iconDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                sort_order,
                created_at: now.clone(),
                updated_at: now,
            });
            Ok(OperationResult {
                action,
                status: "ok".to_string(),
                entity_type: Some("org_unit".to_string()),
                entity_id: Some(id),
                message: Some("Org unit created".to_string()),
                client_op_id: operation.client_op_id.clone(),
            })
        }
        "create_operator" => {
            let name = operation
                .payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let title = operation
                .payload
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let org_unit_id = operation
                .payload
                .get("orgUnitId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let primary_objective = operation
                .payload
                .get("primaryObjective")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let system_directive = operation
                .payload
                .get("systemDirective")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() || title.is_empty() || org_unit_id.is_empty() || primary_objective.is_empty() || system_directive.is_empty() {
                return Err(invalid_input(
                    "create_operator requires payload.name, payload.title, payload.orgUnitId, payload.primaryObjective, payload.systemDirective",
                ));
            }
            if !has_org_unit(snapshot, &org_unit_id) {
                return Err(invalid_input(format!("Unknown org unit: {}", org_unit_id)));
            }
            let manager_operator_id = operation
                .payload
                .get("managerOperatorId")
                .and_then(Value::as_str)
                .map(str::to_string);
            if let Some(manager_id) = manager_operator_id.as_deref() {
                if !has_operator(snapshot, manager_id) {
                    return Err(invalid_input(format!("Unknown manager operator: {}", manager_id)));
                }
            }
            let kind = operation
                .payload
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("agent")
                .trim()
                .to_ascii_lowercase();
            if kind != "agent" && kind != "human" {
                return Err(invalid_input("create_operator payload.kind must be 'agent' or 'human'"));
            }
            let mut source_agent_id = operation
                .payload
                .get("sourceAgentId")
                .and_then(Value::as_str)
                .map(str::to_string);
            if kind == "agent" && source_agent_id.is_none() {
                source_agent_id = Some(next_id("agt"));
            }
            let operator = Operator {
                id: next_id("op"),
                source_agent_id,
                name,
                title,
                primary_objective,
                system_directive,
                role_brief: operation
                    .payload
                    .get("roleBrief")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                kind,
                org_unit_id,
                manager_operator_id,
                avatar_source_data_url: operation
                    .payload
                    .get("avatarSourceDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                avatar_data_url: operation
                    .payload
                    .get("avatarDataUrl")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            if operator.kind == "agent" {
                upsert_agent_manifest(manifests, &operator)?;
            }
            let operator_id = operator.id.clone();
            snapshot.operators.push(operator);
            Ok(OperationResult {
                action,
                status: "ok".to_string(),
                entity_type: Some("operator".to_string()),
                entity_id: Some(operator_id),
                message: Some("Operator created".to_string()),
                client_op_id: operation.client_op_id.clone(),
            })
        }
        "update_operator" => {
            let operator_id = operation
                .payload
                .get("operatorId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if operator_id.is_empty() {
                return Err(invalid_input("update_operator requires payload.operatorId"));
            }
            let patch = operation.payload.get("patch").unwrap_or(&Value::Null);
            let operator = snapshot
                .operators
                .iter_mut()
                .find(|entry| entry.id == operator_id)
                .ok_or_else(|| invalid_input(format!("Unknown operator: {}", operator_id)))?;
            if let Some(value) = patch.get("name").and_then(Value::as_str) {
                operator.name = value.to_string();
            }
            if let Some(value) = patch.get("title").and_then(Value::as_str) {
                operator.title = value.to_string();
            }
            if let Some(value) = patch.get("primaryObjective").and_then(Value::as_str) {
                operator.primary_objective = value.to_string();
            }
            if let Some(value) = patch.get("systemDirective").and_then(Value::as_str) {
                operator.system_directive = value.to_string();
            }
            if let Some(value) = patch.get("roleBrief").and_then(Value::as_str) {
                operator.role_brief = value.to_string();
            }
            if let Some(value) = patch.get("managerOperatorId") {
                operator.manager_operator_id = value.as_str().map(str::to_string);
            }
            operator.updated_at = now;
            if operator.kind == "agent" {
                upsert_agent_manifest(manifests, operator)?;
            }
            Ok(OperationResult {
                action,
                status: "ok".to_string(),
                entity_type: Some("operator".to_string()),
                entity_id: Some(operator_id),
                message: Some("Operator updated".to_string()),
                client_op_id: operation.client_op_id.clone(),
            })
        }
        "read_operator" => {
            let operator_id = operation
                .payload
                .get("operatorId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if operator_id.is_empty() {
                return Err(invalid_input("read_operator requires payload.operatorId"));
            }
            if !has_operator(snapshot, &operator_id) {
                return Err(invalid_input(format!("Unknown operator: {}", operator_id)));
            }
            Ok(OperationResult {
                action,
                status: "ok".to_string(),
                entity_type: Some("operator".to_string()),
                entity_id: Some(operator_id),
                message: Some("operator loaded".to_string()),
                client_op_id: operation.client_op_id.clone(),
            })
        }
        _ => Err(invalid_input(format!(
            "Unsupported action: {}",
            operation.action.trim()
        ))),
    }
}

impl PersistenceStateStore {
    pub fn execute_org_manage_entities_v1(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<OrgManageExecutionOutput, PersistenceError> {
        let operations = parse_operations(args)?;
        let existing_state = self.get_org_chart_state(workspace_id)?;
        let mut state = existing_state.unwrap_or(OrgChartStateRecord {
            snapshot: json!({
                "businessUnits": [],
                "orgUnits": [],
                "operators": [],
                "links": []
            }),
            activity_events: json!([]),
            command_history: json!([]),
            history_cursor: -1,
        });

        let mut snapshot = parse_snapshot(&state.snapshot);
        let mut manifests = self.list_agent_manifests(workspace_id)?;

        let mut results = Vec::new();
        for operation in &operations {
            let result = apply_operation(&mut snapshot, operation, &mut manifests)?;
            results.push(result);
        }

        rebuild_links(&mut snapshot);
        state.snapshot = serde_json::to_value(snapshot).map_err(|error| PersistenceError::JsonSerialize {
            context: "Failed to serialize org snapshot after org tool execution",
            source: error,
        })?;
        self.save_org_chart_state(workspace_id, &state)?;
        self.replace_agent_manifests(workspace_id, &manifests)?;

        let created_count = results
            .iter()
            .filter(|entry| entry.action.starts_with("create_") && entry.status == "ok")
            .count();
        let business_units_count = state
            .snapshot
            .get("businessUnits")
            .and_then(Value::as_array)
            .map(|items| items.len())
            .unwrap_or(0);
        let org_units_count = state
            .snapshot
            .get("orgUnits")
            .and_then(Value::as_array)
            .map(|items| items.len())
            .unwrap_or(0);
        let operators_count = state
            .snapshot
            .get("operators")
            .and_then(Value::as_array)
            .map(|items| items.len())
            .unwrap_or(0);

        let summary = if operations.len() == 1 && operations[0].action == "read_snapshot" {
            format!(
                "Org snapshot loaded: {} business units, {} org units, {} operators.",
                business_units_count, org_units_count, operators_count
            )
        } else if operations.len() == 1 {
            format!("Executed org_manage_entities_v1 action: {}", operations[0].action)
        } else {
            format!(
                "Executed {} org_manage_entities_v1 actions ({} create actions).",
                operations.len(),
                created_count
            )
        };
        let structured_data = json!({
            "operations": results,
            "counts": {
                "businessUnits": business_units_count,
                "orgUnits": org_units_count,
                "operators": operators_count
            },
            "snapshot": state.snapshot
        });

        Ok(OrgManageExecutionOutput {
            summary,
            structured_data,
        })
    }
}
