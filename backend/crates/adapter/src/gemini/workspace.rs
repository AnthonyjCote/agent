use std::{
    fs,
    path::{Path, PathBuf},
};

use app_persistence::bootstrap_workspace;
use agent_core::models::run::RunError;
use serde_json::{Map, Value};

pub const AGENT_DECK_GEMINI_ACK_ALIAS: &str = "agentdeck-ack";
pub const AGENT_DECK_GEMINI_DEEP_DEFAULT_ALIAS: &str = "agentdeck-deep-default";
pub const AGENT_DECK_GEMINI_DEEP_ESCALATE_ALIAS: &str = "agentdeck-deep-escalate";
const GEMINI_ACK_MODEL_ID: &str = "gemini-2.5-flash-lite";
const GEMINI_DEEP_DEFAULT_MODEL_ID: &str = "gemini-3-flash-preview";
const GEMINI_DEEP_ESCALATE_MODEL_ID: &str = "gemini-3-pro-preview";

pub fn ensure_workspace_context() -> Result<PathBuf, RunError> {
    let bootstrap = bootstrap_workspace().map_err(map_persistence_error)?;
    let workspace_dir = bootstrap
        .paths
        .operators_dir
        .join("system")
        .join("runtime");
    fs::create_dir_all(&workspace_dir).map_err(|error| RunError {
        code: "gemini_workspace_create_failed".to_string(),
        message: format!(
            "Failed to create Gemini workspace directory {}: {error}",
            workspace_dir.display()
        ),
        retryable: false,
    })?;

    ensure_workspace_gemini_settings(&workspace_dir)?;
    Ok(workspace_dir)
}

fn map_persistence_error(error: app_persistence::PersistenceError) -> RunError {
    RunError {
        code: "persistence_bootstrap_failed".to_string(),
        message: error.to_string(),
        retryable: false,
    }
}

fn ensure_workspace_gemini_settings(workspace_dir: &Path) -> Result<(), RunError> {
    let gemini_dir = workspace_dir.join(".gemini");
    fs::create_dir_all(&gemini_dir).map_err(|error| RunError {
        code: "gemini_workspace_settings_dir_create_failed".to_string(),
        message: format!(
            "Failed to create Gemini settings directory {}: {error}",
            gemini_dir.display()
        ),
        retryable: false,
    })?;

    let settings_path = gemini_dir.join("settings.json");
    let mut root = load_settings_json(&settings_path)?;
    ensure_alias_config(&mut root);

    let serialized = serde_json::to_string_pretty(&root).map_err(|error| RunError {
        code: "gemini_workspace_settings_serialize_failed".to_string(),
        message: format!(
            "Failed to serialize Gemini settings file {}: {error}",
            settings_path.display()
        ),
        retryable: false,
    })?;

    fs::write(&settings_path, format!("{serialized}\n")).map_err(|error| RunError {
        code: "gemini_workspace_settings_write_failed".to_string(),
        message: format!(
            "Failed to write Gemini settings file {}: {error}",
            settings_path.display()
        ),
        retryable: false,
    })?;

    Ok(())
}

fn load_settings_json(settings_path: &Path) -> Result<Value, RunError> {
    let Some(raw) = fs::read_to_string(settings_path).ok() else {
        return Ok(Value::Object(Map::new()));
    };

    serde_json::from_str::<Value>(&raw).map_err(|error| RunError {
        code: "gemini_workspace_settings_parse_failed".to_string(),
        message: format!(
            "Failed to parse Gemini settings file {}: {error}",
            settings_path.display()
        ),
        retryable: false,
    })
}

fn ensure_alias_config(root: &mut Value) {
    if !root.is_object() {
        *root = Value::Object(Map::new());
    }
    let root_object = root.as_object_mut().expect("root must be object");

    root_object.insert(
        "$schema".to_string(),
        Value::String(
            "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json"
                .to_string(),
        ),
    );
    root_object.insert(
        "model".to_string(),
        serde_json::json!({ "name": AGENT_DECK_GEMINI_DEEP_DEFAULT_ALIAS }),
    );

    let model_configs = root_object
        .entry("modelConfigs".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !model_configs.is_object() {
        *model_configs = Value::Object(Map::new());
    }

    let custom_aliases = model_configs
        .as_object_mut()
        .expect("modelConfigs must be object")
        .entry("customAliases".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !custom_aliases.is_object() {
        *custom_aliases = Value::Object(Map::new());
    }

    let aliases = custom_aliases
        .as_object_mut()
        .expect("customAliases must be object");

    aliases.insert(
        AGENT_DECK_GEMINI_ACK_ALIAS.to_string(),
        serde_json::json!({
            "modelConfig": {
                "model": GEMINI_ACK_MODEL_ID,
                "generateContentConfig": {
                    "thinkingConfig": {
                        "thinkingBudget": 0
                    }
                }
            }
        }),
    );
    aliases.insert(
        AGENT_DECK_GEMINI_DEEP_DEFAULT_ALIAS.to_string(),
        serde_json::json!({
            "modelConfig": {
                "model": GEMINI_DEEP_DEFAULT_MODEL_ID,
                "generateContentConfig": {
                    "tools": [
                        { "googleSearch": {} }
                    ],
                    "thinkingConfig": {
                        "includeThoughts": true,
                        "thinkingLevel": "HIGH"
                    }
                }
            }
        }),
    );
    aliases.insert(
        AGENT_DECK_GEMINI_DEEP_ESCALATE_ALIAS.to_string(),
        serde_json::json!({
            "modelConfig": {
                "model": GEMINI_DEEP_ESCALATE_MODEL_ID,
                "generateContentConfig": {
                    "tools": [
                        { "googleSearch": {} }
                    ],
                    "thinkingConfig": {
                        "includeThoughts": true,
                        "thinkingLevel": "HIGH"
                    }
                }
            }
        }),
    );
}
