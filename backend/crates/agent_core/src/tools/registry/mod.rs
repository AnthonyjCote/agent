use crate::{models::run::RunError, models::tool::ToolOutputEnvelope};

use super::deprecated::weather_open_meteo::{
    execute::execute_weather,
    input::{parse_weather_args, parse_weather_input},
};

pub fn maybe_execute_weather(prompt: &str) -> Result<Option<ToolOutputEnvelope>, RunError> {
    let parsed = match parse_weather_input(prompt) {
        Some(value) => value,
        None => return Ok(None),
    };

    execute_weather(&parsed).map(Some)
}

pub fn execute_tool_by_id(tool_name: &str, args: &serde_json::Value) -> Result<Option<ToolOutputEnvelope>, RunError> {
    match tool_name {
        "weather_open_meteo" => {
            let parsed = parse_weather_args(args).ok_or_else(|| RunError {
                code: "tool_invalid_args".to_string(),
                message: "weather_open_meteo requires {location, day_offset} or {units:[...]} args".to_string(),
                retryable: false,
            })?;
            execute_weather(&parsed).map(Some)
        }
        _ => Ok(None),
    }
}
