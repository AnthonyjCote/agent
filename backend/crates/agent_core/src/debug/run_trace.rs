use crate::models::run::RunEvent;

use super::formatting::summarize_event;

pub fn summarize_trace(events: &[RunEvent]) -> Vec<String> {
    events.iter().map(summarize_event).collect()
}
