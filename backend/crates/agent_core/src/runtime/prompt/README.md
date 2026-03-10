# Prompt

Builds model-facing prompts/context packets for runtime stages.

Contains prompt assembly for:
- Fast ack stage.
- Deep/default stage.
- Tool-specific context injection.

Keep formatting and assembly logic here; avoid run-loop decisions in this folder.
