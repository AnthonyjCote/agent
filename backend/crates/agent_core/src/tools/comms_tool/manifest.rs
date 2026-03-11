use crate::tools::shared::definition::ToolDefinition;

pub fn manifest() -> ToolDefinition {
    ToolDefinition {
        id: "comms_tool",
        summary: "Read and mutate communications threads/messages in batch ops.",
        detail: "tool: comms_tool\n\
tool_label: Comms Tool\n\
actions:\n\
- read\n\
- create\n\
- edit\n\
- delete\n\
targets:\n\
- thread\n\
- message\n\
- messages\n\
- account\n\
- participant\n\
args schema:\n\
{\n\
  \"ops\": [\n\
    {\n\
      \"action\": \"read|create|edit|delete\",\n\
      \"target\": \"thread|message|messages|account|participant\",\n\
      \"selector\": {\"...\": \"target-specific selector fields\"},\n\
      \"payload\": {\"...\": \"target-specific write/edit fields\"}\n\
    }\n\
  ],\n\
  \"atomic\": false\n\
}\n\
notes:\n\
- Keep one batched ops request when multiple comms actions are needed.\n\
- IDs are supported for precise thread/message selection.\n\
- Name refs may also be used where selector semantics allow.\n\
- Sender identity is always scoped to current operator at runtime.\n\
- Do not provide sender account IDs or fromAccountRef for outbound sends; sender is injected deterministically.\n\
- UI should display this tool as `Comms Tool`.\n\
- In this build, `atomic=true` is not yet supported for comms_tool.",
    }
}
