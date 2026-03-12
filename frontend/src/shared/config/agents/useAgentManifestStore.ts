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
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';
import {
  applyAgentManifestUpdate,
  createAgentManifestFromInput,
  type AgentManifest,
  type AgentManifestInput
} from './agent-manifest';
import {
  AGENT_MANIFESTS_CHANGED_EVENT,
  loadAgentManifests,
  normalizeAgentManifestRecords
} from './agent-storage';

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
        const persisted = normalizeAgentManifestRecords(await runtimeClient.listAgentManifests());
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
    void runtimeClient
      .getOrgChartState()
      .then((state) => {
        const operators = (state?.snapshot as { operators?: Array<{ id?: string; sourceAgentId?: string | null }> } | null)
          ?.operators;
        if (!Array.isArray(operators)) {
          return;
        }
        operators
          .filter((operator) => operator.sourceAgentId === agentId)
          .map((operator) => (typeof operator.id === 'string' ? operator.id : ''))
          .filter((operatorId) => operatorId.length > 0)
          .forEach((operatorId) => {
            void runtimeClient.purgeOperatorCommsData(operatorId).catch((error) => {
              console.error(`Failed to purge comms data for deleted agent operator ${operatorId}.`, error);
            });
          });
      })
      .catch(() => undefined);

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
