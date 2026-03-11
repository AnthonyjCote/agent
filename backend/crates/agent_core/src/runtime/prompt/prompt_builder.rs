use chrono::Local;

use crate::tools::{toolbox_prefetch::PrefetchPacket, toolbox_prefetch::manifest::ACK_PREFETCH_SCHEMA};

pub(crate) const FINAL_RESPONSE_SENTINEL: &str = "[[FINAL_RESPONSE]]";

pub(crate) fn ack_prompt(
    agent_name: &str,
    agent_role: &str,
    business_unit_name: &str,
    org_unit_name: &str,
    primary_objective: &str,
    history_excerpt: &str,
    _toolbox_summary: &str,
    user_prompt: &str,
) -> String {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string();
    let history_section = if history_excerpt.trim().is_empty() {
        "Conversation history: (empty)\n".to_string()
    } else {
        format!(
            "Conversation history (oldest -> newest, truncated):\n{}\n",
            history_excerpt.trim()
        )
    };

    format!(
        "Return exactly one JSON object matching the required schema.\n\
Do not output markdown.\n\
Do not output prose before or after JSON.\n\
Do not output code fences.\n\
Do not output keys not defined in the schema.\n\
Do not run tools.\n\
Do not perform web search.\n\
Do not perform substantive analysis.\n\
Do not perform the user's task.\n\
Do not draft emails/messages/replies/documents.\n\
Do not provide recommendations.\n\
Do not explain reasoning.\n\
Do not mention internal routing, handoff, tools, models, agents, or system behavior.\n\n\
You are an ack-stage routing microservice.\n\
Your only job is to:\n\
1. choose the correct decision\n\
2. generate a short user-facing `ack_text`\n\
3. emit minimal structured expansion hints for deep-stage runtime expansion\n\n\
DECISIONS\n\
- ack_only\n\
- handoff_deep_default\n\
- handoff_deep_escalate\n\n\
DECISION RULES\n\
- Use `ack_only` only for:\n\
  - simple pleasantries\n\
  - basic contextual chat\n\
  - exactly one clarification question when required send/check fields are missing and cannot be safely inferred\n\
- Use `handoff_deep_default` for anything requiring execution, drafting, lookup, tools, or multi-step work.\n\
- Use `handoff_deep_escalate` only for clearly high-risk or unusually high-complexity cases.\n\
- Do not escalate just because the task is important.\n\n\
ACK TEXT RULES\n\
- `ack_text` must be short, natural, and user-facing.\n\
- If `decision` is `ack_only`, `ack_text` may be a short conversational reply or exactly one clarification question.\n\
- If `decision` is handoff (`handoff_deep_default` or `handoff_deep_escalate`), `ack_text` must be 1-2 short sentences acknowledging the requested work at a high level.\n\
- For handoff decisions, `ack_text` must not perform the task, draft deliverables, introduce unsupported details, or claim completion.\n\n\
EXPANSION RULES\n\
- `prefetch_tools` and `expansions` are planner hints only.\n\
- Runtime executes expansion; you do not execute tools.\n\
- Keep expansion hints minimal and first-pass only.\n\
- Only include hints directly supported by the user request.\n\
- Prefer defaults over guessed values.\n\
- Keep `prefetch_tools` to max 5.\n\
- Prefer `expansions` over tool-specific prefetch entries for normal routing.\n\
- If a required comms field (method or recipient_ref) is unclear and cannot be safely inferred, ask one clarification question and use `ack_only`.\n\n\
WEB RULE\n\
- Set `requires_web_search` to true only when request needs current external facts/news/market data.\n\
- Otherwise set it to false.\n\n\
{ACK_PREFETCH_SCHEMA}\n\n\
OUTPUT SCHEMA\n\
{{\"decision\":\"ack_only|handoff_deep_default|handoff_deep_escalate\",\"ack_text\":\"short user-facing text\",\"prefetch_tools\":[\"tool_id\"|{{\"tool\":\"tool_id\",\"intent\":\"intent\",\"args\":{{}}}}],\"expansions\":{{\"comms\":{{\"enabled\":false,\"intent\":\"message_send|message_check\",\"method\":\"email|sms|chat|unknown\",\"recipient_ref\":\"\",\"folder\":\"inbox\",\"query\":\"\",\"from_participant\":\"\",\"to_participant\":\"\",\"subject_contains\":\"\",\"state\":\"\"}},\"org\":{{\"enabled\":false,\"intent\":\"org_read_snapshot|org_read_unit|org_read_operator|org_mutate_plan\",\"name_ref\":\"\",\"unit_ref\":\"\"}}}},\"requires_web_search\":false}}\n\n\
DEFAULTING RULE\n\
- If a field is not clearly supported by the request, keep it at default value.\n\
- Prefer minimal valid output over speculative detail.\n\n\
CONTEXT\n\
Operator: {agent_name}\n\
Role: {agent_role}\n\
Business unit: {business_unit_name}\n\
Org unit: {org_unit_name}\n\
Primary objective: {agent_name}'s objective is: {primary_objective}\n\
Current datetime: {now}\n\
{history_section}\
User prompt:\n\
{user_prompt}"
    )
}

pub(crate) fn strip_final_response_sentinel(text: &str) -> String {
    text.replace(FINAL_RESPONSE_SENTINEL, "").trim().to_string()
}

pub(crate) fn deep_prompt(
    agent_name: &str,
    agent_role: &str,
    business_unit_name: &str,
    org_unit_name: &str,
    directive: &str,
    history_excerpt: &str,
    toolbox_summary: &str,
    prefetched_tool_details: &str,
    prefetched_context_packets: &[PrefetchPacket],
    org_compact_preload: &str,
    tool_results_log: &[String],
    work_log: &[String],
    step_index: usize,
    user_prompt: &str,
    requires_web_search: bool,
) -> String {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string();
    let history_section = if history_excerpt.trim().is_empty() {
        "Conversation history: (empty)\n".to_string()
    } else {
        format!(
            "Conversation history (oldest -> newest, truncated):\n{}\n",
            history_excerpt.trim()
        )
    };
    let prefetch_section = if prefetched_tool_details.trim().is_empty() {
        "Prefetched tool details: (none)\n".to_string()
    } else {
        format!(
            "Prefetched tool details:\n{}\n",
            prefetched_tool_details.trim()
        )
    };
    let prefetch_packets_section = if prefetched_context_packets.is_empty() {
        "Resolved prefetch context: (none)\n".to_string()
    } else {
        let rendered = serde_json::to_string_pretty(prefetched_context_packets)
            .unwrap_or_else(|_| "[]".to_string());
        format!("Resolved prefetch context packets:\n{}\n", rendered)
    };
    let tool_results_section = if tool_results_log.is_empty() {
        "App tool results: (none)\n".to_string()
    } else {
        format!(
            "App tool results (latest first):\n{}\n",
            tool_results_log.join("\n")
        )
    };
    let work_log_section = if work_log.is_empty() {
        "Run work log: (empty)\n".to_string()
    } else {
        format!("Run work log (latest first):\n{}\n", work_log.join("\n"))
    };
    let org_preload_section = if org_compact_preload.trim().is_empty() {
        "Org structure preload: (none)\n".to_string()
    } else {
        format!(
            "Org structure preload (name-based hierarchy):\n{}\n",
            org_compact_preload.trim()
        )
    };
    let web_rules = if requires_web_search {
        "- If web search is used for factual claims, include inline refs like [1], [2] beside those claims.\n\
- If web search is used, append a final `Sources:` section.\n\
- If you output a table, use valid markdown table format:\n\
  - one header line\n\
  - one separator line using dashes (for example `|---|---|`)\n\
  - one row per line\n\
- Do not output flattened single-line tables.\n\
- Do not put citation refs inside table cells.\n\
- Put citations for table-derived claims in short bullet notes immediately below the table, then include full entries in `Sources:`.\n\
- The heading must be plain text exactly `Sources:` (no markdown, no bold, no backticks).\n\
- Put `Sources:` on its own line, followed by one source per line.\n\
- Query quality: prefer specific, measurable queries with concrete entities, metrics, dates, and regions.\n\
- Query quality: avoid vague terms alone; pair them with measurable proxies and constraints.\n\
- Query quality: run a broad query first, then 1-3 narrowing follow-up queries only when evidence gaps remain.\n\
- Each source line MUST use this exact format:\n\
  [1] Full Page Title | https://source-home-url | https://raw-grounding-uri\n\
- `Full Page Title` must be human-readable title text (best available page/article title, or a close approximation inferred from page content).\n\
- Never use a URL in `Full Page Title`.\n\
- Never use plain domain-only text in `Full Page Title` (for example `example.com`) when a descriptive title can be inferred.\n\
- `https://source-home-url` must be the canonical site/home URL (for example https://example.com).\n\
- The raw grounding URI must be the exact unedited grounding URL returned by search.\n\
- Never clean, shorten, decode, resolve, or rewrite grounding URLs.\n\
- Do not include `Sources:` if no web grounding was used.\n\
- Do not fabricate citations or URLs.\n\
".to_string()
    } else {
        String::new()
    };
    let comms_runtime_rules = if toolbox_summary.contains("comms_tool") {
        "- Comms tool read/write contract:\n\
- Outbound send is one-step only: use `create message` (do not create thread first).\n\
- For read/check flows, use `read threads` first, then `read messages` with a returned `threadId`.\n\
- Self-scope is enforced automatically to current operator mailbox.\n\
- Do not include sender/operator IDs or attempt cross-mailbox reads.\n\
".to_string()
    } else {
        String::new()
    };

    format!(
        "You are {agent_name}, acting as {agent_role}. This is step {step_index}.\n\
Business unit: {business_unit_name}\n\
Org unit: {org_unit_name}\n\
Current datetime: {now}\n\
Directive: {directive}\n\
{history_section}\
Toolbox summary (only these app tools are explicitly allowed):\n\
{toolbox_summary}\n\
{prefetch_section}\
{prefetch_packets_section}\
{org_preload_section}\
{tool_results_section}\
{work_log_section}\
User prompt: {user_prompt}\n\n\
Runtime instructions:\n\
- You may use native model capabilities/tools (for example web search) when needed.\n\
- Think/work in normal language while solving the request.\n\
- To call app tools from the toolbox, output one JSON object at the end of your message with this exact shape:\n\
  {{\"tool_calls\":[{{\"tool\":\"tool_id\",\"args\":{{}}}}],\"final_response\":null}}\n\
- For app tool calls: keep reasoning short, keep tool_calls minimal, and only use tool IDs listed in toolbox summary.\n\
- Keep streamed status/reasoning updates bite-sized (short, plain-language lines).\n\
- Never include raw tool-call JSON in explanatory prose; if calling app tools, put the single JSON object only at the end.\n\
{comms_runtime_rules}\
- Do not repeat the same tool call with the same args if prior app tool results already provide the needed data.\n\
- If prior app tool results are sufficient to answer, output {FINAL_RESPONSE_SENTINEL} and finalize instead of calling tools again.\n\
- Termination contract (critical):\n\
- After a successful mutating app tool call (create/update/delete/move/assign/set), re-evaluate remaining requested work.\n\
- If requested work is complete, do NOT call more tools; output {FINAL_RESPONSE_SENTINEL} and deliver the final user-facing result.\n\
- Never emit the same mutating app tool call again after a success unless the user explicitly asks to repeat it.\n\
- `final_response`: null is only valid when unresolved requested actions remain.\n\
- If all requested actions are satisfied, terminate the loop in the next response.\n\
- In your final response for creation/update workflows, confirm completion and include created/updated entity names and placement details from tool results.\n\
- Do not wrap tool call JSON in markdown fences.\n\
{web_rules}\
- Keep formatting minimal by default: prefer plain paragraphs and only use bullets/bold/numbering when they add clear readability value.\n\
- When you are ready to deliver the user-facing final answer, the FIRST token must be {FINAL_RESPONSE_SENTINEL}.\n\
- Do not emit {FINAL_RESPONSE_SENTINEL} until final answer.\n\
"
    )
}
