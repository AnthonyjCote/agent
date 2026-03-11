use serde::Serialize;

use super::client::{ForecastResponse, GeocodeResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherMappedResult {
    pub city_name: String,
    pub date: String,
    pub temp_max_c: f64,
    pub temp_min_c: f64,
    pub precipitation_probability_max: f64,
}

pub fn map_forecast(
    geocode: &GeocodeResult,
    forecast: &ForecastResponse,
    day_offset: usize,
) -> Option<WeatherMappedResult> {
    Some(WeatherMappedResult {
        city_name: geocode.name.clone(),
        date: forecast.daily.time.get(day_offset)?.clone(),
        temp_max_c: *forecast.daily.temperature_2m_max.get(day_offset)?,
        temp_min_c: *forecast.daily.temperature_2m_min.get(day_offset)?,
        precipitation_probability_max: *forecast.daily.precipitation_probability_max.get(day_offset)?,
    })
}
