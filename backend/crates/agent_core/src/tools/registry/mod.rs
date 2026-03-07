use crate::{models::run::RunError, models::tool::ToolOutputEnvelope};

use super::weather_open_meteo::{
    execute::execute_weather,
    input::parse_weather_input,
};

pub fn maybe_execute_weather(prompt: &str) -> Result<Option<ToolOutputEnvelope>, RunError> {
    let parsed = match parse_weather_input(prompt) {
        Some(value) => value,
        None => return Ok(None),
    };

    execute_weather(&parsed).map(Some)
}
