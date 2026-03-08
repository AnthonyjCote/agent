use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherRequestUnit {
    pub location: String,
    pub day_offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherToolInput {
    pub units: Vec<WeatherRequestUnit>,
}

fn parse_unit(segment: &str) -> Option<WeatherRequestUnit> {
    let lowered = segment.trim().to_lowercase();
    if !lowered.contains("weather") {
        return None;
    }

    let day_offset = if lowered.contains("tomorrow") { 1 } else { 0 };

    let marker = if lowered.contains(" in ") { " in " } else { " for " };
    let location = lowered
        .split(marker)
        .nth(1)
        .map(|v| v.trim().trim_end_matches('?').trim().to_string())
        .filter(|v| !v.is_empty())?;

    Some(WeatherRequestUnit { location, day_offset })
}

pub fn parse_weather_input(raw_prompt: &str) -> Option<WeatherToolInput> {
    let lowered = raw_prompt.to_lowercase();
    if !lowered.contains("weather") {
        return None;
    }

    let mut units = Vec::new();
    for segment in raw_prompt.split(" and ") {
        if let Some(unit) = parse_unit(segment) {
            units.push(unit);
        }
    }

    if units.is_empty() {
        if let Some(single) = parse_unit(raw_prompt) {
            units.push(single);
        }
    }

    if units.is_empty() {
        return None;
    }

    Some(WeatherToolInput { units })
}

pub fn parse_weather_args(args: &serde_json::Value) -> Option<WeatherToolInput> {
    if let Some(units) = args.get("units") {
        let parsed = serde_json::from_value::<Vec<WeatherRequestUnit>>(units.clone()).ok()?;
        if parsed.is_empty() {
            return None;
        }
        return Some(WeatherToolInput { units: parsed });
    }

    let location = args.get("location")?.as_str()?.trim().to_string();
    if location.is_empty() {
        return None;
    }
    let day_offset = args
        .get("day_offset")
        .and_then(|value| value.as_i64())
        .unwrap_or(0);
    Some(WeatherToolInput {
        units: vec![WeatherRequestUnit { location, day_offset }],
    })
}
