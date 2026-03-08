use crate::tools::shared::definition::ToolDefinition;

pub fn manifest() -> ToolDefinition {
    ToolDefinition {
        id: "org_manage_entities_v1",
        summary: "Create org entities (business units, org units, operators) when permitted.",
        detail: "tool: org_manage_entities_v1\n\
actions:\n\
- create_business_unit\n\
- create_org_unit\n\
- create_operator\n\
args schema:\n\
{\n\
  \"action\": \"create_business_unit|create_org_unit|create_operator\",\n\
  \"payload\": { \"...\": \"action-specific fields\" }\n\
}\n\
permissions:\n\
- Only execute when caller has org mutate permission.\n\
- Reject with structured permission error when denied.\n\
notes:\n\
- Must route through canonical org command service.\n\
- No direct DB writes.\n\
- Return canonical created IDs and placement metadata.",
    }
}
