use crate::models::{run::RunError, tool::ToolOutputEnvelope};

use super::{
    client::{forecast_for_days, geocode_city},
    input::WeatherToolInput,
    mapper::{map_forecast, WeatherMappedResult},
};

fn build_summary(results: &[WeatherMappedResult]) -> String {
    results
        .iter()
        .map(|item| {
            format!(
                "{} ({}) high {:.1}C, low {:.1}C, precipitation {}%",
                item.city_name,
                item.date,
                item.temp_max_c,
                item.temp_min_c,
                item.precipitation_probability_max.round()
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn execute_weather(input: &WeatherToolInput) -> Result<ToolOutputEnvelope, RunError> {
    let mut mapped = Vec::new();

    for unit in &input.units {
        let geo = geocode_city(&unit.location)?;
        let offset = unit.day_offset.max(0) as usize;
        let days = offset + 2;
        let forecast = forecast_for_days(geo.latitude, geo.longitude, &geo.timezone, days)?;

        let result = map_forecast(&geo, &forecast, offset).ok_or_else(|| RunError {
            code: "weather_forecast_missing_day".to_string(),
            message: format!("No forecast data for {} at offset {}", unit.location, offset),
            retryable: false,
        })?;

        mapped.push(result);
    }

    let summary = build_summary(&mapped);
    let structured_data = serde_json::to_value(&mapped).ok();

    Ok(ToolOutputEnvelope {
        summary,
        structured_data,
        artifacts: Vec::new(),
        errors: Vec::new(),
    })
}
