#[derive(Debug, Clone)]
pub struct ToolConsoleRequest {
    pub tool_id: String,
    pub args: serde_json::Value,
    pub operator_id: Option<String>,
    pub operator_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ToolConsoleResponse {
    pub ok: bool,
    pub normalized_args: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
}
