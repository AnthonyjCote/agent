use crate::tools::shared::definition::ToolDefinition;

pub fn manifest() -> ToolDefinition {
    ToolDefinition {
        id: "org_manage_entities_v2",
        summary: "Read and mutate org entities using name-ref-first read/create/update batches.",
        detail: "tool: org_manage_entities_v2\n\
actions:\n\
- read\n\
- create\n\
- update\n\
hierarchy definitions:\n\
- business_unit: top-level business container (can contain child business units and top-level org units)\n\
- org_unit: team/department node inside a business unit or another org unit\n\
- operator: individual human/agent role assigned to an org unit\n\
args schema (strict):\n\
{\n\
  \"action\": \"read|create|update\",\n\
  \"items\": [\n\
    {\"target\":\"snapshot\"}\n\
  ]\n\
}\n\
valid examples:\n\
- read snapshot:\n\
  {\"action\":\"read\",\"items\":[{\"target\":\"snapshot\"}]}\n\
- read one org unit:\n\
  {\"action\":\"read\",\"items\":[{\"target\":\"org_unit\",\"name_ref\":\"Executive Team\"}]}\n\
- create org unit + operators:\n\
  {\"action\":\"create\",\"items\":[\n\
    {\"target\":\"org_unit\",\"name\":\"Strategic Finance\",\"business_unit_name_ref\":\"AC Enterprise\"},\n\
    {\"target\":\"operator\",\"name\":\"Victor Vance\",\"title\":\"Strategic Finance Director\",\"org_unit_name_ref\":\"Strategic Finance\",\"primaryObjective\":\"...\",\"systemDirective\":\"...\"}\n\
  ]}\n\
- update operator title:\n\
  {\"action\":\"update\",\"items\":[{\"target\":\"operator\",\"name_ref\":\"Victor Vance\",\"patch\":{\"title\":\"VP Strategic Finance\"}}]}\n\
read targets:\n\
- snapshot\n\
- business_unit (requires name_ref)\n\
- org_unit (requires name_ref)\n\
- operator (requires name_ref)\n\
create targets:\n\
- business_unit\n\
- org_unit\n\
- operator\n\
update targets:\n\
- operator (patch semantics; only provided fields change)\n\
notes:\n\
- Name-ref first I/O for model-facing use.\n\
- Internal IDs are runtime-only and not required in normal agent workflows.\n\
- Operator naming rule: `name` must be a person-style full name in `First Last` format. Do not use job titles in the `name` field.\n\
- `create operator` requires non-empty: name, title, primaryObjective, systemDirective, and org unit reference.\n\
- Reports-to field (`managerOperatorRef`) is optional and represents direct accountability/decision flow.\n\
- Use judgment: set `managerOperatorRef` when a clear reporting line improves operational clarity (for example lead + direct reports in the same team), and leave it unset when hierarchy is intentionally flat or genuinely unknown.\n\
- Placement rule: set `business_unit_name_ref` to nest under a business unit, or set `parent_org_unit_name_ref` to nest under a specific org unit, so the new org unit is positioned in a logical location within the org chart hierarchy.\n\
- Mixed-target reads are supported in one request via read.items[].\n\
- Writes run atomically: validation failure on any item rolls back the full request.",
    }
}
