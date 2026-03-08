/**
 * Purpose: Provide shared CRUD state for agent manifests.
 * Responsibilities:
 * - Expose create/update/get APIs for agent manifest data.
 * - Persist changes through shared storage layer.
 */
// @tags: shared-config,agents,store
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { useEffect, useMemo, useState } from 'react';
import {
  applyAgentManifestUpdate,
  createAgentManifestFromInput,
  type AgentManifest,
  type AgentManifestInput
} from './agent-manifest';
import { loadAgentManifests, saveAgentManifests } from './agent-storage';

export function useAgentManifestStore() {
  const [agents, setAgents] = useState<AgentManifest[]>(() => loadAgentManifests());

  useEffect(() => {
    saveAgentManifests(agents);
  }, [agents]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [agents]
  );

  const createAgent = (input: AgentManifestInput) => {
    const created = createAgentManifestFromInput(input);
    setAgents((current) => [...current, created]);
    return created;
  };

  const updateAgent = (agentId: string, input: AgentManifestInput) => {
    setAgents((current) =>
      current.map((agent) => (agent.agentId === agentId ? applyAgentManifestUpdate(agent, input) : agent))
    );
  };

  const deleteAgent = (agentId: string) => {
    setAgents((current) => current.filter((agent) => agent.agentId !== agentId));
  };

  return {
    agents: sortedAgents,
    createAgent,
    updateAgent,
    deleteAgent
  };
}
