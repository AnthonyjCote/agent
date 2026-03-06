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
import { createDefaultAgentManifestInput, useAgentManifestStore } from '../../../shared/config/agents';
import { AgentManifestModal } from '../../../shared/modules';
import { TextButton } from '../../../shared/ui';
import './AgentCardsSurface.css';

export function AgentCardsSurface() {
  const [open, setOpen] = useState(false);
  const { createAgent } = useAgentManifestStore();

  return (
    <section className="agent-cards-surface">
      <header className="agent-cards-header">
        <TextButton label="Create Agent" variant="primary" onClick={() => setOpen(true)} />
      </header>

      <AgentManifestModal
        open={open}
        mode="create"
        onClose={() => setOpen(false)}
        onSubmit={(input) => createAgent(input)}
        initialAgent={undefined}
      />

      <div className="agent-cards-empty-state" aria-label="Agent cards workspace" />
    </section>
  );
}
