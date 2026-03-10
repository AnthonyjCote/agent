pub const ACK_PREFETCH_SCHEMA: &str = "Prefetch contract:\n\
- `prefetch_tools` accepts strings OR structured objects.\n\
- Preferred structured form:\n\
  {\"tool\":\"tool_id\",\"intent\":\"intent_name\",\"args\":{\"...\":\"intent-specific\"}}\n\
- Use structured prefetch for deterministic first-pass setup when tools are needed.\n\
- For comms message sending, prefer:\n\
  {\"tool\":\"comms_tool\",\"intent\":\"message_send\",\"args\":{\"method\":\"email|sms|chat\",\"recipient_ref\":\"name/team ref\"}}\n\
- If method or recipient_ref are unclear, ask exactly one clarification question and use ack_only.\n\
- Keep prefetch_tools small (max 5).";

