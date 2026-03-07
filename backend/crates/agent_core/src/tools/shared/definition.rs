#[derive(Debug, Clone, Copy)]
pub struct ToolDefinition {
    pub id: &'static str,
    pub summary: &'static str,
    pub detail: &'static str,
}
