# Streaming

Handles model stream ingestion and conversion into runtime events/deltas.

Responsibilities:
- Read streamed tokens/chunks from provider clients.
- Emit normalized runtime delta events.
- Capture stream-side diagnostics.

Do not place prompt assembly or business routing logic here.
