/**
 * Purpose: Render reusable agent thumbnail grid with quick actions.
 * Responsibilities:
 * - Display agent avatar, name, and role in a responsive card grid.
 * - Provide shared select/edit icon actions for agent-driven workflows.
 */
// @tags: shared-ui,surfaces,agents,grid
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { AgentManifest } from '@/shared/config/agents';
import { AgentAvatar } from '@/shared/ui/avatar';
import './AgentGrid.css';

type AgentGridProps = {
  agents: AgentManifest[];
  activeAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onEditAgent: (agentId: string) => void;
};

function SelectIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 2.4a7.6 7.6 0 1 0 7.6 7.6A7.61 7.61 0 0 0 10 2.4Zm0 2a5.6 5.6 0 1 1-5.6 5.6A5.61 5.61 0 0 1 10 4.4Zm0 2.2a3.4 3.4 0 1 0 3.4 3.4A3.4 3.4 0 0 0 10 6.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m14.8 2.8 2.4 2.4a1.3 1.3 0 0 1 0 1.8l-8.9 8.9-3.8.6.6-3.8L14 2.8a1.3 1.3 0 0 1 1.8 0Zm-8.6 10-.3 1.8 1.8-.3 8.4-8.4-1.5-1.5-8.4 8.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AgentGrid({ agents, activeAgentId, onSelectAgent, onEditAgent }: AgentGridProps) {
  if (agents.length === 0) {
    return <div className="agent-grid-empty">No agents created yet.</div>;
  }

  return (
    <div className="agent-grid">
      {agents.map((agent) => {
        const isActive = agent.agentId === activeAgentId;

        return (
          <article key={agent.agentId} className={`agent-grid-card${isActive ? ' is-active' : ''}`}>
            <div className="agent-grid-media">
              <AgentAvatar name={agent.name} src={agent.avatarDataUrl || undefined} size="lg" shape="circle" />
            </div>

            <div className="agent-grid-meta">
              <h3>{agent.name || 'Untitled Agent'}</h3>
              <p>{agent.role || 'No role set'}</p>
            </div>

            <div className="agent-grid-actions">
              <button
                type="button"
                className={`agent-grid-icon-button${isActive ? ' is-active' : ''}`}
                onClick={() => onSelectAgent(agent.agentId)}
                aria-label={isActive ? `Selected: ${agent.name}` : `Select ${agent.name}`}
                title={isActive ? 'Selected for chat' : 'Select for chat'}
              >
                <SelectIcon />
              </button>
              <button
                type="button"
                className="agent-grid-icon-button"
                onClick={() => onEditAgent(agent.agentId)}
                aria-label={`Edit ${agent.name}`}
                title="Edit agent"
              >
                <EditIcon />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
