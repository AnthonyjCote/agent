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

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';
import { useRuntimeClient } from '../../../app/runtime/RuntimeProvider';
import {
  applyAgentManifestUpdate,
  createAgentManifestFromInput,
  type AgentManifest,
  type AgentManifestInput
} from './agent-manifest';
import { AGENT_MANIFESTS_CHANGED_EVENT, loadAgentManifests } from './agent-storage';

function normalizeAgentManifest(value: unknown): AgentManifest {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: '1.0',
    agentId: typeof record.agentId === 'string' ? record.agentId : `agt_${Math.random().toString(36).slice(2, 10)}`,
    avatarSourceDataUrl: typeof record.avatarSourceDataUrl === 'string' ? record.avatarSourceDataUrl : '',
    avatarDataUrl: typeof record.avatarDataUrl === 'string' ? record.avatarDataUrl : '',
    name: typeof record.name === 'string' ? record.name : '',
    role: typeof record.role === 'string' ? record.role : '',
    primaryObjective: typeof record.primaryObjective === 'string' ? record.primaryObjective : '',
    systemDirectiveShort: typeof record.systemDirectiveShort === 'string' ? record.systemDirectiveShort : '',
    toolsPolicyRef: typeof record.toolsPolicyRef === 'string' ? record.toolsPolicyRef : 'policy_default',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
  };
}

function emitAgentManifestsChanged() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AGENT_MANIFESTS_CHANGED_EVENT));
}

type AgentManifestStoreValue = {
  agents: AgentManifest[];
  createAgent: (input: AgentManifestInput) => AgentManifest;
  updateAgent: (agentId: string, input: AgentManifestInput) => void;
  deleteAgent: (agentId: string) => void;
};

const AgentManifestStoreContext = createContext<AgentManifestStoreValue | null>(null);

function useAgentManifestStoreState(): AgentManifestStoreValue {
  const runtimeClient = useRuntimeClient();
  const [agents, setAgents] = useState<AgentManifest[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const persisted = (await runtimeClient.listAgentManifests()).map(normalizeAgentManifest);
        if (persisted.length > 0) {
          if (!cancelled) {
            setAgents(persisted);
            setHydrated(true);
          }
          return;
        }

        const legacy = loadAgentManifests();
        if (legacy.length > 0) {
          await runtimeClient.replaceAgentManifests(legacy);
          await runtimeClient.completeLocalStorageMigration().catch(() => undefined);
          if (!cancelled) {
            setAgents(legacy);
            setHydrated(true);
          }
          return;
        }

        if (!cancelled) {
          setAgents([]);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) {
          setAgents(loadAgentManifests());
          setHydrated(true);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [runtimeClient]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void runtimeClient.replaceAgentManifests(agents).catch(() => undefined);
  }, [agents, hydrated, runtimeClient]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [agents]
  );

  const createAgent = (input: AgentManifestInput) => {
    const created = createAgentManifestFromInput(input);
    setAgents((current) => [...current, created]);
    emitAgentManifestsChanged();
    return created;
  };

  const updateAgent = (agentId: string, input: AgentManifestInput) => {
    setAgents((current) =>
      current.map((agent) => (agent.agentId === agentId ? applyAgentManifestUpdate(agent, input) : agent))
    );
    emitAgentManifestsChanged();
  };

  const deleteAgent = (agentId: string) => {
    setAgents((current) => current.filter((agent) => agent.agentId !== agentId));
    emitAgentManifestsChanged();
  };

  return {
    agents: sortedAgents,
    createAgent,
    updateAgent,
    deleteAgent
  };
}

export function AgentManifestStoreProvider({ children }: PropsWithChildren) {
  const value = useAgentManifestStoreState();
  return createElement(AgentManifestStoreContext.Provider, { value }, children);
}

export function useAgentManifestStore(): AgentManifestStoreValue {
  const value = useContext(AgentManifestStoreContext);
  if (!value) {
    throw new Error('Agent manifest store missing. Wrap app with AgentManifestStoreProvider.');
  }
  return value;
}
