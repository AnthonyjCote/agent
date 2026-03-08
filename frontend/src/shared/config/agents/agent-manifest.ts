/**
 * Purpose: Define agent manifest contracts for create/edit persistence and orchestration.
 * Responsibilities:
 * - Type required V1 manifest fields used by runtime and routing.
 * - Provide defaults for new agent creation.
 */
// @tags: shared-config,agents,manifest,types
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

export type AgentManifest = {
  schemaVersion: '1.0';
  agentId: string;
  avatarSourceDataUrl: string;
  avatarDataUrl: string;
  name: string;
  role: string;
  primaryObjective: string;
  systemDirectiveShort: string;
  toolsPolicyRef: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentManifestInput = Omit<AgentManifest, 'agentId' | 'schemaVersion' | 'createdAt' | 'updatedAt'>;

export function createDefaultAgentManifestInput(): AgentManifestInput {
  return {
    avatarSourceDataUrl: '',
    avatarDataUrl: '',
    name: '',
    role: '',
    primaryObjective: '',
    systemDirectiveShort: '',
    toolsPolicyRef: 'policy_default',
  };
}

export function createAgentManifestFromInput(input: AgentManifestInput): AgentManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0',
    agentId: `agt_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

export function applyAgentManifestUpdate(agent: AgentManifest, input: AgentManifestInput): AgentManifest {
  return {
    ...agent,
    ...input,
    updatedAt: new Date().toISOString()
  };
}
