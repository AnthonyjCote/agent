/**
 * Purpose: Compose agent-cards surface actions for agent creation workflow.
 * Responsibilities:
 * - Render top-right create-agent action.
 * - Launch shared agent manifest modal in create mode.
 */
// @tags: domain,agent-cards,surface,layout
// @status: active
// @owner: founder
// @domain: agent-cards
// @adr: none

import { useState } from 'react';
import { useAgentManifestStore } from '../../../shared/config/agents';
import { useOrgChartStore } from '../../../shared/config/org-chart';
import { AgentManifestModal } from '../../../shared/modules';
import { TextButton } from '../../../shared/ui';
import './AgentCardsSurface.css';

export function AgentCardsSurface() {
  const [open, setOpen] = useState(false);
  const { createAgent } = useAgentManifestStore();
  const { orgUnits, operators, execute } = useOrgChartStore();
  const orgUnitOptions = orgUnits.map((unit) => ({ value: unit.id, label: unit.name }));
  const managerOptions = [
    { value: '', label: 'No manager' },
    ...operators.map((operator) => ({ value: operator.id, label: `${operator.name} (${operator.title})` }))
  ];

  return (
    <section className="agent-cards-surface">
      <header className="agent-cards-header">
        <TextButton label="Create Agent" variant="primary" onClick={() => setOpen(true)} />
      </header>

      <AgentManifestModal
        open={open}
        mode="create"
        onClose={() => setOpen(false)}
        orgUnitOptions={orgUnitOptions}
        managerOptions={managerOptions}
        defaultOrgUnitId={orgUnits[0]?.id ?? ''}
        defaultManagerOperatorId={null}
        onSubmit={(input, placement) => {
          const created = createAgent(input);
          if (!placement.orgUnitId) {
            return;
          }
          execute({
            kind: 'create_operator',
            targetOrgUnitId: placement.orgUnitId,
            payload: {
              sourceAgentId: created.agentId,
              name: input.name.trim() || 'New Operator',
              title: input.role.trim() || 'Role',
              kind: 'agent',
              managerOperatorId: placement.managerOperatorId ?? null,
              primaryObjective: input.primaryObjective,
              systemDirective: input.systemDirectiveShort,
              roleBrief: '',
              avatarSourceDataUrl: input.avatarSourceDataUrl,
              avatarDataUrl: input.avatarDataUrl
            }
          });
        }}
        initialAgent={undefined}
      />

      <div className="agent-cards-empty-state" aria-label="Agent cards workspace" />
    </section>
  );
}
