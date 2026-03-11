pub const ACK_PREFETCH_SCHEMA: &str = "Prefetch contract:\n\
- `prefetch_tools` accepts strings OR structured objects.\n\
- Structured form:\n\
  {\"tool\":\"tool_id\",\"intent\":\"intent_name\",\"args\":{\"...\":\"intent-specific\"}}\n\
- Optional alias form `expansions` is supported for small-model routing.\n\
- Use `expansions` as the primary routing alias for simple models.\n\
- Runtime maps `expansions` to deterministic backend prefetch logic for deep-stage context setup.\n\
- Keep expansion hints minimal and directly supported by request context.\n\
- Keep prefetch_tools small (max 5).";
