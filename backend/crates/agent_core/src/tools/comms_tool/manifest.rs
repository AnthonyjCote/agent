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
- account\n\
- accounts\n\
- thread\n\
- threads\n\
- message\n\
- messages\n\
args schema:\n\
{\n\
  \"ops\": [\n\
    {\n\
      \"action\": \"read|create|edit|delete\",\n\
      \"target\": \"account|accounts|thread|threads|message|messages\",\n\
      \"selector\": {\"...\": \"target-specific selector fields\"},\n\
      \"payload\": {\"...\": \"target-specific write/edit fields\"}\n\
    }\n\
  ],\n\
  \"atomic\": false\n\
}\n\
notes:\n\
- Keep one batched ops request when multiple comms actions are needed.\n\
- Sender identity is always scoped to current operator at runtime.\n\
- Read scope is always scoped to current operator mailbox at runtime.\n\
- Do not provide sender account IDs or fromAccountRef for outbound sends; sender is injected deterministically.\n\
- For outbound messaging, use one-step send: `create message` with `channel`, recipient destination, and content.\n\
- Do not require or assume a separate `create thread` step for sending.\n\
- Use read ops in this form:\n\
  - read threads: `{\"ops\":[{\"action\":\"read\",\"target\":\"threads\",\"selector\":{\"channel\":\"email|sms|chat\",\"folder\":\"inbox|sent|...\",\"search\":\"...\"}}]}`\n\
  - read messages: `{\"ops\":[{\"action\":\"read\",\"target\":\"messages\",\"selector\":{\"threadId\":\"<thread_id>\"}}]}`\n\
- UI should display this tool as `Comms Tool`.\n\
- In this build, `atomic=true` is not yet supported for comms_tool.",
    }
}
