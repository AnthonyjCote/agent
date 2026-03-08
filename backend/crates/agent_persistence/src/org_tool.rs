use std::collections::{HashMap, HashSet};
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
struct OrgV2Request {
    action: String,
    #[serde(default)]
    items: Vec<Value>,
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
    target: Option<String>,
    name_ref: Option<String>,
    message: Option<String>,
    client_op_id: Option<String>,
}

#[derive(Debug, Clone)]
struct CreatedRef {
    target: String,
    id: String,
    name: String,
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
        context: "Invalid org_manage_entities_v2 input",
        source: std::io::Error::new(std::io::ErrorKind::InvalidInput, message.into()),
        path: None,
    }
}

fn normalize_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn parse_requests(args: &Value) -> Result<Vec<OrgV2Request>, PersistenceError> {
    if let Some(actions) = args.get("actions").and_then(Value::as_array) {
        let mut out = Vec::new();
        for action in actions {
            let parsed: OrgV2Request = serde_json::from_value(action.clone())
                .map_err(|error| invalid_input(error.to_string()))?;
            out.push(parsed);
        }
        if out.is_empty() {
            return Err(invalid_input("actions array is empty"));
        }
        return Ok(out);
    }

    let parsed: OrgV2Request = serde_json::from_value(args.clone())
        .map_err(|error| invalid_input(error.to_string()))?;
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

fn upsert_agent_manifest(manifests: &mut Vec<Value>, operator: &Operator) -> Result<(), PersistenceError> {
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

fn get_item_string<'a>(item: &'a Value, keys: &[&str]) -> Option<&'a str> {
    for key in keys {
        let value = item.get(*key).and_then(Value::as_str).map(str::trim).unwrap_or("");
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

fn resolve_by_name_ref<'a, T, F>(
    values: &'a [T],
    target_label: &str,
    name_ref: &str,
    to_name: F,
) -> Result<&'a T, PersistenceError>
where
    F: Fn(&T) -> &str,
{
    let normalized = normalize_name(name_ref);
    let matches = values
        .iter()
        .filter(|value| normalize_name(to_name(value)) == normalized)
        .collect::<Vec<_>>();
    match matches.len() {
        0 => Err(invalid_input(format!(
            "{} not found for name_ref: {}",
            target_label, name_ref
        ))),
        1 => Ok(matches[0]),
        _ => Err(invalid_input(format!(
            "ambiguous {} name_ref: {}",
            target_label, name_ref
        ))),
    }
}

fn resolve_business_unit_id(
    snapshot: &OrgSnapshot,
    item: &Value,
    created_refs: &HashMap<String, CreatedRef>,
    allow_none: bool,
) -> Result<Option<String>, PersistenceError> {
    if let Some(id) = get_item_string(item, &["business_unit_id", "businessUnitId"]) {
        if !has_business_unit(snapshot, id) {
            return Err(invalid_input(format!("Unknown business unit id: {}", id)));
        }
        return Ok(Some(id.to_string()));
    }

    if let Some(name_ref) = get_item_string(item, &["business_unit_name_ref", "businessUnitNameRef", "business_unit_ref", "businessUnitRef"]) {
        if let Some(stripped) = name_ref.strip_prefix('@') {
            let reference = created_refs
                .get(stripped)
                .ok_or_else(|| invalid_input(format!("Unknown batch ref: @{}", stripped)))?;
            if reference.target != "business_unit" {
                return Err(invalid_input(format!(
                    "Batch ref @{} is {}, expected business_unit",
                    stripped, reference.target
                )));
            }
            return Ok(Some(reference.id.clone()));
        }
        let unit = resolve_by_name_ref(&snapshot.business_units, "business_unit", name_ref, |value| &value.name)?;
        return Ok(Some(unit.id.clone()));
    }

    if allow_none {
        Ok(None)
    } else {
        Err(invalid_input("Missing business unit reference"))
    }
}

fn resolve_org_unit_id(
    snapshot: &OrgSnapshot,
    item: &Value,
    created_refs: &HashMap<String, CreatedRef>,
    allow_none: bool,
) -> Result<Option<String>, PersistenceError> {
    if let Some(id) = get_item_string(item, &["org_unit_id", "orgUnitId"]) {
        if !has_org_unit(snapshot, id) {
            return Err(invalid_input(format!("Unknown org unit id: {}", id)));
        }
        return Ok(Some(id.to_string()));
    }

    if let Some(name_ref) = get_item_string(item, &["org_unit_name_ref", "orgUnitNameRef", "org_unit_ref", "orgUnitRef"]) {
        if let Some(stripped) = name_ref.strip_prefix('@') {
            let reference = created_refs
                .get(stripped)
                .ok_or_else(|| invalid_input(format!("Unknown batch ref: @{}", stripped)))?;
            if reference.target != "org_unit" {
                return Err(invalid_input(format!(
                    "Batch ref @{} is {}, expected org_unit",
                    stripped, reference.target
                )));
            }
            return Ok(Some(reference.id.clone()));
        }
        let unit = resolve_by_name_ref(&snapshot.org_units, "org_unit", name_ref, |value| &value.name)?;
        return Ok(Some(unit.id.clone()));
    }

    if allow_none {
        Ok(None)
    } else {
        Err(invalid_input("Missing org unit reference"))
    }
}

fn resolve_operator_id(
    snapshot: &OrgSnapshot,
    item: &Value,
    created_refs: &HashMap<String, CreatedRef>,
    allow_none: bool,
) -> Result<Option<String>, PersistenceError> {
    if let Some(id) = get_item_string(item, &["operator_id", "operatorId", "manager_operator_id", "managerOperatorId"]) {
        if !has_operator(snapshot, id) {
            return Err(invalid_input(format!("Unknown operator id: {}", id)));
        }
        return Ok(Some(id.to_string()));
    }

    if let Some(name_ref) = get_item_string(item, &["operator_name_ref", "operatorNameRef", "manager_operator_name_ref", "managerOperatorNameRef", "operator_ref", "operatorRef", "manager_operator_ref", "managerOperatorRef"]) {
        if let Some(stripped) = name_ref.strip_prefix('@') {
            let reference = created_refs
                .get(stripped)
                .ok_or_else(|| invalid_input(format!("Unknown batch ref: @{}", stripped)))?;
            if reference.target != "operator" {
                return Err(invalid_input(format!(
                    "Batch ref @{} is {}, expected operator",
                    stripped, reference.target
                )));
            }
            return Ok(Some(reference.id.clone()));
        }
        let operator = resolve_by_name_ref(&snapshot.operators, "operator", name_ref, |value| &value.name)?;
        return Ok(Some(operator.id.clone()));
    }

    if allow_none {
        Ok(None)
    } else {
        Err(invalid_input("Missing operator reference"))
    }
}

fn render_compact_snapshot(snapshot: &OrgSnapshot) -> Value {
    let bu_by_parent = {
        let mut map: HashMap<Option<String>, Vec<&BusinessUnit>> = HashMap::new();
        for unit in &snapshot.business_units {
            map.entry(unit.parent_business_unit_id.clone()).or_default().push(unit);
        }
        for entries in map.values_mut() {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
        }
        map
    };

    let ou_by_parent = {
        let mut map: HashMap<Option<String>, Vec<&OrgUnit>> = HashMap::new();
        for unit in &snapshot.org_units {
            map.entry(unit.parent_org_unit_id.clone()).or_default().push(unit);
        }
        for entries in map.values_mut() {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
        }
        map
    };

    let ou_by_bu = {
        let mut map: HashMap<Option<String>, Vec<&OrgUnit>> = HashMap::new();
        for unit in &snapshot.org_units {
            if unit.parent_org_unit_id.is_none() {
                map.entry(unit.business_unit_id.clone()).or_default().push(unit);
            }
        }
        for entries in map.values_mut() {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
        }
        map
    };

    let op_by_ou = {
        let mut map: HashMap<String, Vec<&Operator>> = HashMap::new();
        for operator in &snapshot.operators {
            map.entry(operator.org_unit_id.clone()).or_default().push(operator);
        }
        for entries in map.values_mut() {
            entries.sort_by(|a, b| a.name.cmp(&b.name));
        }
        map
    };

    fn render_org_unit_tree(
        unit: &OrgUnit,
        ou_by_parent: &HashMap<Option<String>, Vec<&OrgUnit>>,
        op_by_ou: &HashMap<String, Vec<&Operator>>,
    ) -> Value {
        let sub_units = ou_by_parent
            .get(&Some(unit.id.clone()))
            .map(|items| {
                items
                    .iter()
                    .map(|item| render_org_unit_tree(item, ou_by_parent, op_by_ou))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let operators = op_by_ou
            .get(&unit.id)
            .map(|items| {
                items
                    .iter()
                    .map(|operator| {
                        json!({
                            "name": operator.name,
                            "title": operator.title,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        json!({
            "name": unit.name,
            "subUnits": sub_units,
            "operators": operators
        })
    }

    fn render_business_tree(
        unit: &BusinessUnit,
        bu_by_parent: &HashMap<Option<String>, Vec<&BusinessUnit>>,
        ou_by_bu: &HashMap<Option<String>, Vec<&OrgUnit>>,
        ou_by_parent: &HashMap<Option<String>, Vec<&OrgUnit>>,
        op_by_ou: &HashMap<String, Vec<&Operator>>,
    ) -> Value {
        let child_business_units = bu_by_parent
            .get(&Some(unit.id.clone()))
            .map(|items| {
                items
                    .iter()
                    .map(|item| render_business_tree(item, bu_by_parent, ou_by_bu, ou_by_parent, op_by_ou))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let org_units = ou_by_bu
            .get(&Some(unit.id.clone()))
            .map(|items| {
                items
                    .iter()
                    .map(|item| render_org_unit_tree(item, ou_by_parent, op_by_ou))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        json!({
            "name": unit.name,
            "businessUnits": child_business_units,
            "orgUnits": org_units,
        })
    }

    let roots = bu_by_parent
        .get(&None)
        .map(|items| {
            items
                .iter()
                .map(|item| render_business_tree(item, &bu_by_parent, &ou_by_bu, &ou_by_parent, &op_by_ou))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let operator_index = snapshot
        .operators
        .iter()
        .map(|operator| {
            json!({
                "name": operator.name,
                "title": operator.title,
            })
        })
        .collect::<Vec<_>>();

    json!({
        "tree": roots,
        "operatorIndex": operator_index,
    })
}

fn read_snapshot_item(snapshot: &OrgSnapshot, client_op_id: Option<String>) -> (OperationResult, Value) {
    (
        OperationResult {
            action: "read".to_string(),
            status: "ok".to_string(),
            target: Some("snapshot".to_string()),
            name_ref: None,
            message: Some("snapshot loaded".to_string()),
            client_op_id,
        },
        json!({
            "target": "snapshot",
            "data": render_compact_snapshot(snapshot),
        }),
    )
}

fn read_business_unit_item(
    snapshot: &OrgSnapshot,
    item: &Value,
    client_op_id: Option<String>,
) -> Result<(OperationResult, Value), PersistenceError> {
    let name_ref = get_item_string(item, &["name_ref", "nameRef"]) 
        .ok_or_else(|| invalid_input("read business_unit requires name_ref"))?;
    let unit = resolve_by_name_ref(&snapshot.business_units, "business_unit", name_ref, |value| &value.name)?;

    let child_business_units = snapshot
        .business_units
        .iter()
        .filter(|entry| entry.parent_business_unit_id.as_deref() == Some(unit.id.as_str()))
        .map(|entry| {
            json!({
                "name": entry.name,
                "shortDescription": entry.short_description,
            })
        })
        .collect::<Vec<_>>();

    let child_org_units = snapshot
        .org_units
        .iter()
        .filter(|entry| {
            entry.parent_org_unit_id.is_none() && entry.business_unit_id.as_deref() == Some(unit.id.as_str())
        })
        .map(|entry| {
            json!({
                "name": entry.name,
                "shortDescription": entry.short_description,
            })
        })
        .collect::<Vec<_>>();

    Ok((
        OperationResult {
            action: "read".to_string(),
            status: "ok".to_string(),
            target: Some("business_unit".to_string()),
            name_ref: Some(name_ref.to_string()),
            message: Some("business unit loaded".to_string()),
            client_op_id,
        },
        json!({
            "target": "business_unit",
            "data": {
                "name": unit.name,
                "shortDescription": unit.short_description,
                "businessUnits": child_business_units,
                "orgUnits": child_org_units,
            }
        }),
    ))
}

fn render_org_unit_nested(snapshot: &OrgSnapshot, unit_id: &str) -> Value {
    let unit = snapshot.org_units.iter().find(|entry| entry.id == unit_id);
    let Some(unit) = unit else {
        return json!({});
    };

    let child_units = snapshot
        .org_units
        .iter()
        .filter(|entry| entry.parent_org_unit_id.as_deref() == Some(unit.id.as_str()))
        .map(|entry| render_org_unit_nested(snapshot, &entry.id))
        .collect::<Vec<_>>();

    let operators = snapshot
        .operators
        .iter()
        .filter(|entry| entry.org_unit_id == unit.id)
        .map(|entry| {
            json!({
                "name": entry.name,
                "title": entry.title,
                "primaryObjective": entry.primary_objective,
            })
        })
        .collect::<Vec<_>>();

    json!({
        "name": unit.name,
        "shortDescription": unit.short_description,
        "subUnits": child_units,
        "operators": operators,
    })
}

fn read_org_unit_item(
    snapshot: &OrgSnapshot,
    item: &Value,
    client_op_id: Option<String>,
) -> Result<(OperationResult, Value), PersistenceError> {
    let name_ref = get_item_string(item, &["name_ref", "nameRef"]) 
        .ok_or_else(|| invalid_input("read org_unit requires name_ref"))?;
    let unit = resolve_by_name_ref(&snapshot.org_units, "org_unit", name_ref, |value| &value.name)?;

    Ok((
        OperationResult {
            action: "read".to_string(),
            status: "ok".to_string(),
            target: Some("org_unit".to_string()),
            name_ref: Some(name_ref.to_string()),
            message: Some("org unit loaded".to_string()),
            client_op_id,
        },
        json!({
            "target": "org_unit",
            "data": render_org_unit_nested(snapshot, &unit.id)
        }),
    ))
}

fn read_operator_item(
    snapshot: &OrgSnapshot,
    item: &Value,
    client_op_id: Option<String>,
) -> Result<(OperationResult, Value), PersistenceError> {
    let name_ref = get_item_string(item, &["name_ref", "nameRef"]) 
        .ok_or_else(|| invalid_input("read operator requires name_ref"))?;
    let operator = resolve_by_name_ref(&snapshot.operators, "operator", name_ref, |value| &value.name)?;

    let org_unit_name = snapshot
        .org_units
        .iter()
        .find(|unit| unit.id == operator.org_unit_id)
        .map(|unit| unit.name.clone())
        .unwrap_or_default();

    let reports_to = operator
        .manager_operator_id
        .as_deref()
        .and_then(|id| snapshot.operators.iter().find(|entry| entry.id == id))
        .map(|entry| json!({"name": entry.name, "title": entry.title}));

    let direct_reports = snapshot
        .operators
        .iter()
        .filter(|entry| entry.manager_operator_id.as_deref() == Some(operator.id.as_str()))
        .map(|entry| json!({"name": entry.name, "title": entry.title}))
        .collect::<Vec<_>>();

    let mut data = json!({
        "name": operator.name,
        "title": operator.title,
        "type": operator.kind,
        "orgUnit": org_unit_name,
        "reportsTo": reports_to,
        "directReports": direct_reports,
        "primaryObjective": operator.primary_objective,
    });

    if operator.kind == "agent" {
        data["systemDirective"] = json!(operator.system_directive);
    } else {
        data["roleBrief"] = json!(operator.role_brief);
    }

    Ok((
        OperationResult {
            action: "read".to_string(),
            status: "ok".to_string(),
            target: Some("operator".to_string()),
            name_ref: Some(name_ref.to_string()),
            message: Some("operator loaded".to_string()),
            client_op_id,
        },
        json!({
            "target": "operator",
            "data": data,
        }),
    ))
}

fn execute_read(
    snapshot: &OrgSnapshot,
    request: &OrgV2Request,
) -> Result<(Vec<OperationResult>, Vec<Value>), PersistenceError> {
    let mut results = Vec::new();
    let mut outputs = Vec::new();

    for item in &request.items {
        let target = get_item_string(item, &["target"]).unwrap_or("snapshot").to_ascii_lowercase();
        let (result, output) = match target.as_str() {
            "snapshot" => read_snapshot_item(snapshot, request.client_op_id.clone()),
            "business_unit" => read_business_unit_item(snapshot, item, request.client_op_id.clone())?,
            "org_unit" => read_org_unit_item(snapshot, item, request.client_op_id.clone())?,
            "operator" => read_operator_item(snapshot, item, request.client_op_id.clone())?,
            _ => {
                return Err(invalid_input(format!(
                    "Unsupported read target: {}",
                    target
                )))
            }
        };
        results.push(result);
        outputs.push(output);
    }

    Ok((results, outputs))
}

fn execute_create(
    snapshot: &mut OrgSnapshot,
    request: &OrgV2Request,
    manifests: &mut Vec<Value>,
) -> Result<(Vec<OperationResult>, Vec<Value>), PersistenceError> {
    let now = now_tag();
    let mut created_refs: HashMap<String, CreatedRef> = HashMap::new();
    let mut seen_refs: HashSet<String> = HashSet::new();
    let mut results = Vec::new();
    let mut outputs = Vec::new();

    for item in &request.items {
        let target = get_item_string(item, &["target"]) 
            .ok_or_else(|| invalid_input("create item requires target"))?
            .to_ascii_lowercase();
        let name = get_item_string(item, &["name"]).unwrap_or("").trim().to_string();
        if name.is_empty() {
            return Err(invalid_input("create item requires name"));
        }

        let ref_name = get_item_string(item, &["ref"]).map(str::to_string);
        if let Some(ref_name) = ref_name.as_deref() {
            let normalized = normalize_name(ref_name);
            if !seen_refs.insert(normalized.clone()) {
                return Err(invalid_input(format!("Duplicate create ref in batch: {}", ref_name)));
            }
        }

        match target.as_str() {
            "business_unit" => {
                let parent_business_unit_id = resolve_business_unit_id(snapshot, item, &created_refs, true)?;
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
                    name: name.clone(),
                    short_description: get_item_string(item, &["shortDescription", "short_description"]).unwrap_or("").to_string(),
                    parent_business_unit_id,
                    logo_source_data_url: get_item_string(item, &["logoSourceDataUrl", "logo_source_data_url"]).unwrap_or("").to_string(),
                    logo_data_url: get_item_string(item, &["logoDataUrl", "logo_data_url"]).unwrap_or("").to_string(),
                    sort_order,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                });
                if let Some(ref_name) = ref_name {
                    created_refs.insert(normalize_name(&ref_name), CreatedRef {
                        target: "business_unit".to_string(),
                        id: id.clone(),
                        name: name.clone(),
                    });
                }
                results.push(OperationResult {
                    action: "create".to_string(),
                    status: "ok".to_string(),
                    target: Some("business_unit".to_string()),
                    name_ref: Some(name.clone()),
                    message: Some("business unit created".to_string()),
                    client_op_id: request.client_op_id.clone(),
                });
                outputs.push(json!({
                    "target": "business_unit",
                    "name": name,
                    "status": "created"
                }));
            }
            "org_unit" => {
                let parent_org_unit_id = resolve_org_unit_id(snapshot, item, &created_refs, true)?;
                let inherited_business_unit_id = if let Some(parent_id) = parent_org_unit_id.as_deref() {
                    snapshot
                        .org_units
                        .iter()
                        .find(|unit| unit.id == parent_id)
                        .and_then(|unit| unit.business_unit_id.clone())
                } else {
                    None
                };
                let explicit_business_unit_id = resolve_business_unit_id(snapshot, item, &created_refs, true)?;
                let business_unit_id = explicit_business_unit_id.or(inherited_business_unit_id);

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
                    name: name.clone(),
                    short_description: get_item_string(item, &["shortDescription", "short_description"]).unwrap_or("").to_string(),
                    parent_org_unit_id,
                    business_unit_id,
                    icon_source_data_url: get_item_string(item, &["iconSourceDataUrl", "icon_source_data_url"]).unwrap_or("").to_string(),
                    icon_data_url: get_item_string(item, &["iconDataUrl", "icon_data_url"]).unwrap_or("").to_string(),
                    sort_order,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                });
                if let Some(ref_name) = ref_name {
                    created_refs.insert(normalize_name(&ref_name), CreatedRef {
                        target: "org_unit".to_string(),
                        id: id.clone(),
                        name: name.clone(),
                    });
                }
                results.push(OperationResult {
                    action: "create".to_string(),
                    status: "ok".to_string(),
                    target: Some("org_unit".to_string()),
                    name_ref: Some(name.clone()),
                    message: Some("org unit created".to_string()),
                    client_op_id: request.client_op_id.clone(),
                });
                outputs.push(json!({
                    "target": "org_unit",
                    "name": name,
                    "status": "created"
                }));
            }
            "operator" => {
                let title = get_item_string(item, &["title"]).unwrap_or("").trim().to_string();
                let primary_objective = get_item_string(item, &["primaryObjective", "primary_objective"]).unwrap_or("").trim().to_string();
                let system_directive = get_item_string(item, &["systemDirective", "system_directive"]).unwrap_or("").trim().to_string();
                if title.is_empty() || primary_objective.is_empty() || system_directive.is_empty() {
                    return Err(invalid_input(
                        "create operator requires title, primaryObjective, and systemDirective",
                    ));
                }
                let org_unit_id = resolve_org_unit_id(snapshot, item, &created_refs, false)?
                    .ok_or_else(|| invalid_input("create operator requires org_unit reference"))?;
                let manager_operator_id = resolve_operator_id(snapshot, item, &created_refs, true)?;

                let kind = get_item_string(item, &["type", "kind"]).unwrap_or("agent").to_ascii_lowercase();
                if kind != "agent" && kind != "human" {
                    return Err(invalid_input("create operator type must be 'agent' or 'human'"));
                }
                let mut source_agent_id = get_item_string(item, &["sourceAgentId", "source_agent_id"]).map(str::to_string);
                if kind == "agent" && source_agent_id.is_none() {
                    source_agent_id = Some(next_id("agt"));
                }

                let operator = Operator {
                    id: next_id("op"),
                    source_agent_id,
                    name: name.clone(),
                    title: title.clone(),
                    primary_objective: primary_objective.clone(),
                    system_directive,
                    role_brief: get_item_string(item, &["roleBrief", "role_brief"]).unwrap_or("").to_string(),
                    kind: kind.clone(),
                    org_unit_id,
                    manager_operator_id,
                    avatar_source_data_url: get_item_string(item, &["avatarSourceDataUrl", "avatar_source_data_url"]).unwrap_or("").to_string(),
                    avatar_data_url: get_item_string(item, &["avatarDataUrl", "avatar_data_url"]).unwrap_or("").to_string(),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };
                if operator.kind == "agent" {
                    upsert_agent_manifest(manifests, &operator)?;
                }
                let operator_id = operator.id.clone();
                snapshot.operators.push(operator);
                if let Some(ref_name) = ref_name {
                    created_refs.insert(normalize_name(&ref_name), CreatedRef {
                        target: "operator".to_string(),
                        id: operator_id,
                        name: name.clone(),
                    });
                }
                results.push(OperationResult {
                    action: "create".to_string(),
                    status: "ok".to_string(),
                    target: Some("operator".to_string()),
                    name_ref: Some(name.clone()),
                    message: Some("operator created".to_string()),
                    client_op_id: request.client_op_id.clone(),
                });
                outputs.push(json!({
                    "target": "operator",
                    "name": name,
                    "title": title,
                    "primaryObjective": primary_objective,
                    "status": "created"
                }));
            }
            _ => {
                return Err(invalid_input(format!("Unsupported create target: {}", target)));
            }
        }
    }

    let created_refs_summary = created_refs
        .values()
        .map(|entry| {
            json!({
                "target": entry.target,
                "name": entry.name,
                "status": "created"
            })
        })
        .collect::<Vec<_>>();

    if !created_refs_summary.is_empty() {
        outputs.push(json!({
            "target": "batch_refs",
            "data": created_refs_summary
        }));
    }

    Ok((results, outputs))
}

fn execute_update(
    snapshot: &mut OrgSnapshot,
    request: &OrgV2Request,
    manifests: &mut Vec<Value>,
) -> Result<(Vec<OperationResult>, Vec<Value>), PersistenceError> {
    let now = now_tag();
    let mut results = Vec::new();
    let mut outputs = Vec::new();

    for item in &request.items {
        let target = get_item_string(item, &["target"])
            .ok_or_else(|| invalid_input("update item requires target"))?
            .to_ascii_lowercase();
        let patch = item
            .get("patch")
            .and_then(Value::as_object)
            .ok_or_else(|| invalid_input("update item requires patch object"))?;

        match target.as_str() {
            "operator" => {
                let operator_index = if let Some(id) = get_item_string(item, &["operator_id", "operatorId"]) {
                    snapshot
                        .operators
                        .iter()
                        .position(|entry| entry.id == id)
                        .ok_or_else(|| invalid_input(format!("Unknown operator id: {}", id)))?
                } else {
                    let name_ref = get_item_string(item, &["name_ref", "nameRef", "operator_name_ref", "operatorNameRef"])
                        .ok_or_else(|| invalid_input("update operator requires name_ref or operator_id"))?;
                    let normalized = normalize_name(name_ref);
                    let matches = snapshot
                        .operators
                        .iter()
                        .enumerate()
                        .filter(|(_, entry)| normalize_name(&entry.name) == normalized)
                        .collect::<Vec<_>>();
                    if matches.is_empty() {
                        return Err(invalid_input(format!("operator not found for name_ref: {}", name_ref)));
                    }
                    if matches.len() > 1 {
                        return Err(invalid_input(format!("ambiguous operator name_ref: {}", name_ref)));
                    }
                    matches.into_iter().next().expect("validated non-empty").0
                };
                let operator_id = snapshot.operators[operator_index].id.clone();
                let resolved_org_unit_id = if patch.get("orgUnitRef").or_else(|| patch.get("org_unit_ref")).is_some() {
                    let org_ref = patch
                        .get("orgUnitRef")
                        .or_else(|| patch.get("org_unit_ref"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if org_ref.is_empty() {
                        return Err(invalid_input("update operator orgUnitRef cannot be empty"));
                    }
                    let org = resolve_by_name_ref(&snapshot.org_units, "org_unit", org_ref, |value| &value.name)?;
                    Some(org.id.clone())
                } else {
                    None
                };
                let resolved_manager_operator_id = if patch.get("managerOperatorRef").or_else(|| patch.get("manager_operator_ref")).is_some() {
                    let manager_ref = patch
                        .get("managerOperatorRef")
                        .or_else(|| patch.get("manager_operator_ref"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if manager_ref.is_empty() {
                        Some(None)
                    } else {
                        let manager = resolve_by_name_ref(&snapshot.operators, "operator", manager_ref, |value| &value.name)?;
                        if manager.id == operator_id {
                            return Err(invalid_input("operator cannot report to itself"));
                        }
                        Some(Some(manager.id.clone()))
                    }
                } else {
                    None
                };

                let operator = &mut snapshot.operators[operator_index];

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
                if patch.get("type").or_else(|| patch.get("kind")).is_some() {
                    let kind = patch
                        .get("type")
                        .or_else(|| patch.get("kind"))
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    if kind != "agent" && kind != "human" {
                        return Err(invalid_input("update operator type must be 'agent' or 'human'"));
                    }
                    operator.kind = kind;
                }
                if let Some(org_unit_id) = resolved_org_unit_id {
                    operator.org_unit_id = org_unit_id;
                }
                if let Some(manager_operator_id) = resolved_manager_operator_id {
                    operator.manager_operator_id = manager_operator_id;
                }
                operator.updated_at = now.clone();
                if operator.kind == "agent" {
                    upsert_agent_manifest(manifests, operator)?;
                }
                results.push(OperationResult {
                    action: "update".to_string(),
                    status: "ok".to_string(),
                    target: Some("operator".to_string()),
                    name_ref: Some(operator.name.clone()),
                    message: Some("operator updated".to_string()),
                    client_op_id: request.client_op_id.clone(),
                });
                outputs.push(json!({
                    "target": "operator",
                    "name": operator.name,
                    "title": operator.title,
                    "status": "updated"
                }));
            }
            _ => return Err(invalid_input(format!("Unsupported update target: {}", target))),
        }
    }

    Ok((results, outputs))
}

impl PersistenceStateStore {
    pub fn build_org_compact_preload(&self, workspace_id: &str) -> Result<String, PersistenceError> {
        let existing_state = self.get_org_chart_state(workspace_id)?;
        let Some(state) = existing_state else {
            return Ok("(no org structure found)".to_string());
        };
        let snapshot = parse_snapshot(&state.snapshot);
        let compact = render_compact_snapshot(&snapshot);
        let tree = compact
            .get("tree")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        fn walk_business(node: &Value, indent: usize, lines: &mut Vec<String>) {
            let name = node.get("name").and_then(Value::as_str).unwrap_or("Business Unit");
            lines.push(format!("{}{}", "-".repeat(indent), name));
            for ou in node
                .get("orgUnits")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                walk_org(&ou, indent + 1, lines);
            }
            for bu in node
                .get("businessUnits")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                walk_business(&bu, indent + 1, lines);
            }
        }

        fn walk_org(node: &Value, indent: usize, lines: &mut Vec<String>) {
            let name = node.get("name").and_then(Value::as_str).unwrap_or("Org Unit");
            lines.push(format!("{}{}", "-".repeat(indent), name));
            for op in node
                .get("operators")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                let op_name = op.get("name").and_then(Value::as_str).unwrap_or("Operator");
                let op_title = op.get("title").and_then(Value::as_str).unwrap_or("");
                lines.push(format!("{}{} ({})", "-".repeat(indent + 1), op_name, op_title));
            }
            for child in node
                .get("subUnits")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                walk_org(&child, indent + 1, lines);
            }
        }

        let mut lines = Vec::new();
        for node in tree {
            walk_business(&node, 1, &mut lines);
        }

        if lines.is_empty() {
            Ok("(no org structure found)".to_string())
        } else {
            Ok(lines.join("\n"))
        }
    }

    pub fn execute_org_manage_entities_v2(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<OrgManageExecutionOutput, PersistenceError> {
        let requests = parse_requests(args)?;
        if requests.is_empty() {
            return Err(invalid_input("request is empty"));
        }
        for request in &requests {
            if request.items.is_empty() {
                return Err(invalid_input("each action requires non-empty items[]"));
            }
        }

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

        let mut operations = Vec::new();
        let mut outputs = Vec::new();

        for request in &requests {
            let action = request.action.trim().to_ascii_lowercase();
            let (op_results, op_outputs) = match action.as_str() {
                "read" => execute_read(&snapshot, request)?,
                "create" => execute_create(&mut snapshot, request, &mut manifests)?,
                "update" => execute_update(&mut snapshot, request, &mut manifests)?,
                _ => return Err(invalid_input(format!("Unsupported action: {}", request.action))),
            };
            operations.extend(op_results);
            outputs.extend(op_outputs);
        }

        rebuild_links(&mut snapshot);
        state.snapshot = serde_json::to_value(snapshot).map_err(|error| PersistenceError::JsonSerialize {
            context: "Failed to serialize org snapshot after org tool execution",
            source: error,
        })?;
        self.save_org_chart_state(workspace_id, &state)?;
        self.replace_agent_manifests(workspace_id, &manifests)?;

        let created_count = operations
            .iter()
            .filter(|entry| entry.action == "create" && entry.status == "ok")
            .count();
        let updated_count = operations
            .iter()
            .filter(|entry| entry.action == "update" && entry.status == "ok")
            .count();

        let snapshot_for_counts = parse_snapshot(&state.snapshot);
        let summary = format!(
            "Org update complete: {} business units, {} org units, {} operators ({} created, {} updated).",
            snapshot_for_counts.business_units.len(),
            snapshot_for_counts.org_units.len(),
            snapshot_for_counts.operators.len(),
            created_count,
            updated_count
        );

        let structured_data = json!({
            "operations": operations,
            "results": outputs,
            "snapshot": render_compact_snapshot(&snapshot_for_counts),
            "counts": {
                "businessUnits": snapshot_for_counts.business_units.len(),
                "orgUnits": snapshot_for_counts.org_units.len(),
                "operators": snapshot_for_counts.operators.len(),
            }
        });

        Ok(OrgManageExecutionOutput {
            summary,
            structured_data,
        })
    }

    pub fn execute_org_manage_entities_v1(
        &self,
        workspace_id: &str,
        args: &Value,
    ) -> Result<OrgManageExecutionOutput, PersistenceError> {
        self.execute_org_manage_entities_v2(workspace_id, args)
    }
}
