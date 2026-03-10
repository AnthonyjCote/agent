use serde_json::Value;

use crate::models::run::RunError;

pub fn parse_args(args: &Value) -> Result<Value, RunError> {
    let has_ops = args
        .get("ops")
        .and_then(Value::as_array)
        .map(|items| !items.is_empty())
        .unwrap_or(false);
    if has_ops {
        return Ok(args.clone());
    }
    Err(RunError {
        code: "tool_invalid_args".to_string(),
        message: "comms_tool requires non-empty `ops` array".to_string(),
        retryable: false,
    })
}
