use crate::tools::shared::definition::ToolDefinition;

pub fn manifest() -> ToolDefinition {
    ToolDefinition {
        id: "org_manage_entities_v1",
        summary: "Read and mutate org entities (business units, org units, operators) in batch.",
        detail: "tool: org_manage_entities_v1\n\
actions:\n\
- read_snapshot\n\
- create_business_unit\n\
- create_org_unit\n\
- create_operator\n\
- read_operator\n\
- update_operator\n\
args schema:\n\
{\n\
  \"action\": \"read_snapshot|create_business_unit|create_org_unit|create_operator|read_operator|update_operator\",\n\
  \"payload\": { \"...\": \"action-specific fields\" }\n\
}\n\
or batched form:\n\
{\n\
  \"actions\": [\n\
    {\"action\":\"create_business_unit\",\"payload\":{\"name\":\"...\"}},\n\
    {\"action\":\"create_org_unit\",\"payload\":{\"name\":\"...\",\"businessUnitId\":\"...\"}},\n\
    {\"action\":\"create_operator\",\"payload\":{\"name\":\"...\",\"title\":\"...\",\"orgUnitId\":\"...\",\"primaryObjective\":\"...\",\"systemDirective\":\"...\"}}\n\
  ]\n\
}\n\
permissions:\n\
- Only execute when caller has org mutate permission.\n\
- Reject with structured permission error when denied.\n\
notes:\n\
- Must route through canonical org command service.\n\
- For `create_operator`, `primaryObjective` and `systemDirective` are required (non-empty).\n\
- Use `read_snapshot` first when IDs are unknown.\n\
- Return canonical created IDs and placement metadata.",
    }
}
