use crate::tools::shared::definition::ToolDefinition;

pub fn manifest() -> ToolDefinition {
    ToolDefinition {
        id: "weather_open_meteo",
        summary: "Get forecast weather for one or more city/date requests.",
        detail: "tool: weather_open_meteo\n\
args schema:\n\
{\n\
  \"location\": \"city, region, country\",\n\
  \"day_offset\": 0\n\
}\n\
or batched form:\n\
{\n\
  \"units\": [\n\
    { \"location\": \"city name\", \"day_offset\": 0 },\n\
    { \"location\": \"city name\", \"day_offset\": 1 }\n\
  ]\n\
}\n\
notes:\n\
- day_offset: 0=today, 1=tomorrow, 2+=future days.\n\
- Use city strings users provide; runtime geocodes them.",
    }
}
