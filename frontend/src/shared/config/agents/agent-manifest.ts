/**
 * Purpose: Define agent manifest contracts for create/edit persistence and orchestration.
 * Responsibilities:
 * - Type required, deterministic, and optional manifest fields.
 * - Provide defaults for new agent creation.
 */
// @tags: shared-config,agents,manifest,types
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

export type AgentStylePreset = 'direct' | 'balanced' | 'collaborative';
export type AuthorityScope = 'low' | 'medium' | 'high';

export type AgentManifest = {
  schemaVersion: '1.0';
  agentId: string;
  avatarSourceDataUrl: string;
  avatarDataUrl: string;
  name: string;
  role: string;
  primaryObjective: string;
  systemDirectiveShort: string;
  stylePreset: AgentStylePreset;
  toolsPolicyRef: string;
  memoryProfileRef: string;
  deterministic: {
    authorityScope: AuthorityScope;
    kpiTargets: string[];
    sopRefs: string[];
    sopSummary: string;
  };
  optionalContext: {
    enabled: boolean;
    decisionAuthorityNotes: string;
    kpiPriorityNotes: string;
    constraintNotes: string;
    escalationNotes: string;
    organizationContext: string;
    communicationContract: string;
    personalityProfile: string;
    biography: string;
    jobDescriptionLong: string;
  };
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
    stylePreset: 'direct',
    toolsPolicyRef: 'policy_default',
    memoryProfileRef: 'memory_default',
    deterministic: {
      authorityScope: 'medium',
      kpiTargets: [],
      sopRefs: [],
      sopSummary: ''
    },
    optionalContext: {
      enabled: false,
      decisionAuthorityNotes: '',
      kpiPriorityNotes: '',
      constraintNotes: '',
      escalationNotes: '',
      organizationContext: '',
      communicationContract: '',
      personalityProfile: '',
      biography: '',
      jobDescriptionLong: ''
    }
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
