use std::collections::HashSet;

use super::{
    org_manage_entities_v2::manifest::manifest as org_manage_entities_tool_manifest,
    shared::definition::ToolDefinition,
    weather_open_meteo::manifest::manifest as weather_tool_manifest,
};

fn registered_tool_definitions() -> Vec<ToolDefinition> {
    vec![weather_tool_manifest(), org_manage_entities_tool_manifest()]
}

fn find_tool_definition<'a>(tool_id: &str, definitions: &'a [ToolDefinition]) -> Option<&'a ToolDefinition> {
    definitions.iter().find(|definition| definition.id == tool_id)
}

fn default_allowed_tool_ids() -> Vec<String> {
    registered_tool_definitions()
        .into_iter()
        .map(|definition| definition.id.to_string())
        .collect()
}

pub fn allowed_tool_ids_from_metadata(metadata: &serde_json::Value) -> Vec<String> {
    let definitions = registered_tool_definitions();
    let requested = metadata
        .get("allowed_tool_ids")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if requested.is_empty() {
        return default_allowed_tool_ids();
    }

    let filtered = requested
        .into_iter()
        .filter(|tool_id| find_tool_definition(tool_id.as_str(), &definitions).is_some())
        .collect::<Vec<_>>();

    if filtered.is_empty() {
        default_allowed_tool_ids()
    } else {
        filtered
    }
}

pub fn sanitize_requested_tool_ids(requested: &[String], allowed: &[String]) -> Vec<String> {
    let allowed_set = allowed.iter().map(String::as_str).collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for tool_id in requested {
        let normalized = tool_id.trim();
        if normalized.is_empty() || !allowed_set.contains(normalized) || !seen.insert(normalized.to_string()) {
            continue;
        }
        out.push(normalized.to_string());
    }

    out
}

pub fn render_toolbox_summary(allowed_tool_ids: &[String]) -> String {
    let definitions = registered_tool_definitions();
    let mut lines = Vec::new();
    for tool_id in allowed_tool_ids {
        if let Some(definition) = find_tool_definition(tool_id, &definitions) {
            lines.push(format!("- {}: {}", tool_id, definition.summary));
        }
    }

    if lines.is_empty() {
        "- (no tools available)".to_string()
    } else {
        lines.join("\n")
    }
}

pub fn render_tool_details(requested_tool_ids: &[String], allowed_tool_ids: &[String]) -> String {
    let definitions = registered_tool_definitions();
    let requested = sanitize_requested_tool_ids(requested_tool_ids, allowed_tool_ids);
    if requested.is_empty() {
        return String::new();
    }

    let mut sections = Vec::new();
    for tool_id in requested {
        if let Some(definition) = find_tool_definition(tool_id.as_str(), &definitions) {
            sections.push(definition.detail.to_string());
        }
    }

    sections.join("\n\n")
}
