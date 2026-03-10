pub(crate) fn compact_for_log(input: &str, max_len: usize) -> String {
    let compact = input.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.len() <= max_len {
        compact
    } else {
        format!("{}...", &compact[..max_len])
    }
}

pub(crate) fn extract_reasoning_for_work_log(text: &str, final_response_sentinel: &str) -> String {
    let mut value = text.to_string();
    if let Some(index) = value.find(final_response_sentinel) {
        value = value[..index].to_string();
    }
    if let Some(index) = value.find("{\"tool_calls\"") {
        value = value[..index].to_string();
    }
    compact_for_log(value.trim(), 700)
}

