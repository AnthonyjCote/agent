use serde::Deserialize;

use crate::models::run::RunError;

#[derive(Debug, Deserialize)]
pub struct GeocodeResponse {
    #[serde(default)]
    pub results: Vec<GeocodeResult>,
}

#[derive(Debug, Deserialize)]
pub struct GeocodeResult {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub admin1: Option<String>,
    #[serde(default)]
    pub admin2: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ForecastResponse {
    pub daily: DailyForecast,
}

#[derive(Debug, Deserialize)]
pub struct DailyForecast {
    pub time: Vec<String>,
    pub temperature_2m_max: Vec<f64>,
    pub temperature_2m_min: Vec<f64>,
    pub precipitation_probability_max: Vec<f64>,
}

fn geocode_search_raw(query_text: &str) -> Result<Vec<GeocodeResult>, RunError> {
    let query = urlencoding::encode(query_text);
    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={query}&count=10&language=en&format=json"
    );

    let response = ureq::get(&url).call().map_err(|error| RunError {
        code: "weather_geocode_request_failed".to_string(),
        message: format!("Geocode request failed: {error}"),
        retryable: true,
    })?;

    let body: GeocodeResponse = response.into_body().read_json().map_err(|error| RunError {
        code: "weather_geocode_decode_failed".to_string(),
        message: format!("Failed to decode geocode response: {error}"),
        retryable: false,
    })?;

    Ok(body.results)
}

fn geocode_candidates(input: &str) -> Vec<String> {
    let normalized = input.trim();
    if normalized.is_empty() {
        return vec![];
    }

    let parts = normalized
        .split(',')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    let mut candidates = Vec::new();
    candidates.push(normalized.to_string());

    if let Some(first) = parts.first() {
        candidates.push((*first).to_string());
    }

    if parts.len() >= 2 {
        candidates.push(format!("{} {}", parts[0], parts[1]));
    }

    candidates
}

fn score_match(raw_input: &str, result: &GeocodeResult) -> i32 {
    let lowered = raw_input.to_lowercase();
    let tokens = lowered
        .split(',')
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    let mut score = 0;
    let haystacks = [
        result.name.to_lowercase(),
        result.country.clone().unwrap_or_default().to_lowercase(),
        result.admin1.clone().unwrap_or_default().to_lowercase(),
        result.admin2.clone().unwrap_or_default().to_lowercase(),
    ];

    for token in &tokens {
        if haystacks.iter().any(|value| value.contains(token)) {
            score += 4;
        }
    }

    if haystacks[0] == tokens.first().cloned().unwrap_or_default() {
        score += 3;
    }

    score
}

pub fn geocode_city(city: &str) -> Result<GeocodeResult, RunError> {
    let mut best: Option<(i32, GeocodeResult)> = None;

    for candidate in geocode_candidates(city) {
        let results = geocode_search_raw(&candidate)?;

        for result in results {
            let score = score_match(city, &result);
            match &best {
                Some((best_score, _)) if *best_score >= score => {}
                _ => best = Some((score, result)),
            }
        }
    }

    best.map(|(_, result)| result).ok_or_else(|| RunError {
        code: "weather_location_not_found".to_string(),
        message: format!("Location not found: {city}"),
        retryable: false,
    })
}

pub fn forecast_for_days(
    latitude: f64,
    longitude: f64,
    timezone: &str,
    days: usize,
) -> Result<ForecastResponse, RunError> {
    let timezone = urlencoding::encode(timezone);
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone={timezone}&forecast_days={days}"
    );

    let response = ureq::get(&url).call().map_err(|error| RunError {
        code: "weather_forecast_request_failed".to_string(),
        message: format!("Forecast request failed: {error}"),
        retryable: true,
    })?;

    response.into_body().read_json().map_err(|error| RunError {
        code: "weather_forecast_decode_failed".to_string(),
        message: format!("Failed to decode forecast response: {error}"),
        retryable: false,
    })
}
