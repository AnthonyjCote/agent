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
- operator_directory\n\
- thread\n\
- threads\n\
- message\n\
- messages\n\
args schema:\n\
{\n\
  \"ops\": [\n\
    {\n\
      \"action\": \"read|create|edit|delete\",\n\
      \"target\": \"account|accounts|operator_directory|thread|threads|message|messages\",\n\
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
  - read operator_directory: `{\"ops\":[{\"action\":\"read\",\"target\":\"operator_directory\",\"selector\":{\"channel\":\"email|sms|chat\",\"query\":\"name/title/email search\",\"name\":\"optional\",\"title\":\"optional\",\"limit\":8}}]}`\n\
  - read threads: `{\"ops\":[{\"action\":\"read\",\"target\":\"threads\",\"selector\":{\"channel\":\"email|sms|chat\",\"folder\":\"inbox|sent|...\",\"search\":\"...\"}}]}`\n\
  - read messages: `{\"ops\":[{\"action\":\"read\",\"target\":\"messages\",\"selector\":{\"threadId\":\"<thread_id>\"}}]}`\n\
- `read threads` selector supports robust filters: `fromParticipant`, `toParticipant`, `subjectContains`, `state`.\n\
- Thread filters are fuzzy-friendly for participant/subject matching (partial/near matches).\n\
- UI should display this tool as `Comms Tool`.\n\
- In this build, `atomic=true` is not yet supported for comms_tool.",
    }
}
