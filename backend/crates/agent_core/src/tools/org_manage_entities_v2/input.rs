use serde_json::Value;

use crate::models::run::RunError;

pub fn parse_args(args: &Value) -> Result<Value, RunError> {
    if args.get("actions").is_some() {
        return Ok(args.clone());
    }
    if args.get("action").is_some() || args.get("ops").is_some() {
        return Ok(args.clone());
    }
    Err(RunError {
        code: "tool_invalid_args".to_string(),
        message: "org_manage_entities_v2 requires `actions` or `action` payload".to_string(),
        retryable: false,
    })
}
