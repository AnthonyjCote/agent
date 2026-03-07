use std::{
    env, fs,
    path::{Path, PathBuf},
};

use agent_core::models::run::RunError;
use serde_json::{Map, Value};

pub const AGENT_DECK_GEMINI_MODEL_ALIAS: &str = "agentdeck-flash-thinking";
const GEMINI_MODEL_ID: &str = "gemini-3-flash-preview";

pub fn ensure_workspace_context() -> Result<PathBuf, RunError> {
    let workspace_dir = resolve_workspace_dir()?;
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

fn resolve_workspace_dir() -> Result<PathBuf, RunError> {
    if let Some(override_dir) = env::var("AGENT_DECK_WORKSPACE_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Ok(PathBuf::from(override_dir));
    }

    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").map_err(|_| RunError {
            code: "gemini_workspace_home_missing".to_string(),
            message: "HOME is not set; cannot resolve macOS Application Support path.".to_string(),
            retryable: false,
        })?;
        return Ok(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("AgentDeck")
                .join("workspaces")
                .join("default"),
        );
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = env::var("APPDATA")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| {
                env::var("USERPROFILE")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| PathBuf::from(value).join("AppData").join("Roaming"))
            })
            .ok_or_else(|| RunError {
                code: "gemini_workspace_appdata_missing".to_string(),
                message: "APPDATA and USERPROFILE are not set; cannot resolve Windows application data path."
                    .to_string(),
                retryable: false,
            })?;
        return Ok(
            app_data
                .join("AgentDeck")
                .join("workspaces")
                .join("default"),
        );
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(data_home) = env::var("XDG_DATA_HOME")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return Ok(
                PathBuf::from(data_home)
                    .join("agent-deck")
                    .join("workspaces")
                    .join("default"),
            );
        }

        let home = env::var("HOME").map_err(|_| RunError {
            code: "gemini_workspace_home_missing".to_string(),
            message: "HOME is not set; cannot resolve Linux data path.".to_string(),
            retryable: false,
        })?;
        Ok(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("agent-deck")
                .join("workspaces")
                .join("default"),
        )
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
        serde_json::json!({ "name": AGENT_DECK_GEMINI_MODEL_ALIAS }),
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

    custom_aliases
        .as_object_mut()
        .expect("customAliases must be object")
        .insert(
            AGENT_DECK_GEMINI_MODEL_ALIAS.to_string(),
            serde_json::json!({
                "modelConfig": {
                    "model": GEMINI_MODEL_ID,
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
