/**
 * Purpose: Expose command-driven org-chart state for domain surfaces.
 * Responsibilities:
 * - Persist and hydrate org-chart data.
 * - Execute validated commands and expose undo/redo controls.
 */
// @tags: shared-config,org-chart,store
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
  useRef,
  useState,
  type PropsWithChildren
} from 'react';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';
import {
  AGENT_MANIFESTS_CHANGED_EVENT,
  loadAgentManifests,
  normalizeAgentManifestRecords
} from '@/shared/config/agents/agent-storage';
import type { AgentManifest } from '@/shared/config/agents';
import {
  canRedoOrgCommand,
  canUndoOrgCommand,
  executeOrgCommand,
  redoOrgCommand,
  undoOrgCommand
} from './commands';
import { loadOrgChartData } from './storage';
import { createInitialOrgChartData } from './seed';
import type { OperatorId, BusinessUnitId, OrgChartData, OrgCommand, OrgUnitId } from './types';

type OrgCommandResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

function sortOrgUnits(units: OrgChartData['snapshot']['orgUnits']) {
  return [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function sortBusinessUnits(units: OrgChartData['snapshot']['businessUnits']) {
  return [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function sortActors(operators: OrgChartData['snapshot']['operators']) {
  return [...operators].sort((a, b) => a.name.localeCompare(b.name));
}

function buildPersistedOrgChartState(data: OrgChartData) {
  return {
    snapshot: data.snapshot,
    activityEvents: [] as OrgChartData['activityEvents'],
    commandHistory: [] as OrgChartData['commandHistory'],
    historyCursor: -1
  };
}

function syncOperatorsFromAgents(
  current: OrgChartData,
  manifests: AgentManifest[],
  options?: { createMissingOperators?: boolean }
): OrgChartData {
  const SYSTEM_UNASSIGNED_ORG_UNIT_DESCRIPTION = 'System bucket for unassigned operators.';
  const createMissingOperators = options?.createMissingOperators ?? false;
  let next = current;
  let changed = false;

  const apply = (command: OrgCommand) => {
    next = executeOrgCommand(next, command);
    changed = true;
  };

  const ensureUnassignedOperatorsOrgUnit = (shouldCreate: boolean): OrgUnitId | null => {
    if (!shouldCreate) {
      return null;
    }
    const byName = next.snapshot.orgUnits.find((unit) => {
      const name = unit.name.trim().toLowerCase();
      return (
        name === 'unassigned operators' ||
        unit.shortDescription.trim() === SYSTEM_UNASSIGNED_ORG_UNIT_DESCRIPTION
      );
    }
    );
    if (byName) {
      if (byName.parentOrgUnitId !== null || byName.businessUnitId !== null) {
        apply({
          kind: 'move_org_unit',
          nodeId: byName.id,
          newParentId: null
        });
        apply({
          kind: 'assign_org_unit_business_unit',
          orgUnitId: byName.id,
          businessUnitId: null
        });
      }
      return byName.id;
    }

    apply({
      kind: 'create_org_unit',
      parentId: null,
      payload: {
        name: 'Unassigned Operators',
        shortDescription: SYSTEM_UNASSIGNED_ORG_UNIT_DESCRIPTION,
        rootBusinessUnitId: null
      }
    });
    return (
      next.snapshot.orgUnits.find((unit) => unit.name.trim().toLowerCase() === 'unassigned operators')?.id ??
      null
    );
  };

  const bySourceAgentId = new Map(
    next.snapshot.operators
      .filter((operator) => typeof operator.sourceAgentId === 'string' && operator.sourceAgentId.length > 0)
      .map((operator) => [operator.sourceAgentId as string, operator])
  );
  const missingManifests = manifests.filter((manifest) => !bySourceAgentId.has(manifest.agentId));
  if (missingManifests.length === 0) {
    const systemUnassigned = next.snapshot.orgUnits.find(
      (unit) => unit.shortDescription.trim() === SYSTEM_UNASSIGNED_ORG_UNIT_DESCRIPTION
    );
    if (systemUnassigned) {
      const hasOperators = next.snapshot.operators.some((operator) => operator.orgUnitId === systemUnassigned.id);
      const hasChildren = next.snapshot.orgUnits.some((unit) => unit.parentOrgUnitId === systemUnassigned.id);
      if (!hasOperators && !hasChildren) {
        apply({ kind: 'delete_org_unit', nodeId: systemUnassigned.id });
      }
    }
  }
  const defaultOrgUnitId = ensureUnassignedOperatorsOrgUnit(createMissingOperators && missingManifests.length > 0);
  if (missingManifests.length > 0 && !defaultOrgUnitId) {
    return changed ? next : current;
  }
  const manifestIds = new Set(manifests.map((manifest) => manifest.agentId));

  manifests.forEach((manifest: AgentManifest) => {
    const existing = bySourceAgentId.get(manifest.agentId);
    if (!existing) {
      if (!createMissingOperators) {
        return;
      }
      if (defaultOrgUnitId) {
        apply({
          kind: 'create_operator',
          targetOrgUnitId: defaultOrgUnitId,
          payload: {
            sourceAgentId: manifest.agentId,
            name: manifest.name,
            title: manifest.role,
            kind: 'agent',
            primaryObjective: manifest.primaryObjective,
            systemDirective: manifest.systemDirectiveShort,
            roleBrief: '',
            avatarSourceDataUrl: manifest.avatarSourceDataUrl,
            avatarDataUrl: manifest.avatarDataUrl
          }
        });
      }
      return;
    }

    const patch: Extract<OrgCommand, { kind: 'update_operator' }>['patch'] = {};
    if (existing.name !== manifest.name) {
      patch.name = manifest.name;
    }
    if (existing.title !== manifest.role) {
      patch.title = manifest.role;
    }
    if (existing.kind !== 'agent') {
      patch.kind = 'agent';
    }
    if (existing.primaryObjective !== manifest.primaryObjective) {
      patch.primaryObjective = manifest.primaryObjective;
    }
    if (existing.systemDirective !== manifest.systemDirectiveShort) {
      patch.systemDirective = manifest.systemDirectiveShort;
    }
    if (existing.roleBrief !== '') {
      patch.roleBrief = '';
    }

    if (Object.keys(patch).length > 0) {
      apply({
        kind: 'update_operator',
        operatorId: existing.id,
        patch
      });
    }

    if (
      existing.avatarDataUrl !== manifest.avatarDataUrl ||
      existing.avatarSourceDataUrl !== manifest.avatarSourceDataUrl
    ) {
      apply({
        kind: 'set_operator_avatar',
        operatorId: existing.id,
        sourceDataUrl: manifest.avatarSourceDataUrl,
        croppedDataUrl: manifest.avatarDataUrl
      });
    }
  });

  next.snapshot.operators.forEach((operator) => {
    if (!operator.sourceAgentId) {
      return;
    }
    if (manifestIds.has(operator.sourceAgentId)) {
      return;
    }
    apply({ kind: 'delete_operator', operatorId: operator.id });
  });

  return changed ? next : current;
}

type OrgChartStoreValue = {
  data: OrgChartData;
  businessUnits: OrgChartData['snapshot']['businessUnits'];
  orgUnits: OrgChartData['snapshot']['orgUnits'];
  operators: OrgChartData['snapshot']['operators'];
  links: OrgChartData['snapshot']['links'];
  activityEvents: OrgChartData['activityEvents'];
  canUndo: boolean;
  canRedo: boolean;
  execute: (command: OrgCommand) => OrgCommandResult;
  refreshFromRuntime: () => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  getBusinessUnitById: (id: BusinessUnitId) => OrgChartData['snapshot']['businessUnits'][number] | undefined;
  getOrgUnitById: (id: OrgUnitId) => OrgChartData['snapshot']['orgUnits'][number] | undefined;
  getOperatorById: (id: OperatorId) => OrgChartData['snapshot']['operators'][number] | undefined;
};

const OrgChartStoreContext = createContext<OrgChartStoreValue | null>(null);

function useOrgChartStoreState(): OrgChartStoreValue {
  const runtimeClient = useRuntimeClient();
  const [data, setData] = useState<OrgChartData>(() => createInitialOrgChartData());
  const [hydrated, setHydrated] = useState(false);
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeAgentManifests = async (): Promise<AgentManifest[]> => {
      try {
        return normalizeAgentManifestRecords(await runtimeClient.listAgentManifests());
      } catch {
        return loadAgentManifests();
      }
    };

    const hydrate = async () => {
      try {
        const remote = await runtimeClient.getOrgChartState();
        if (remote) {
          const manifests = await loadRuntimeAgentManifests();
          const next = {
            snapshot: remote.snapshot as OrgChartData['snapshot'],
            activityEvents: [],
            commandHistory: [],
            historyCursor: -1
          } satisfies OrgChartData;
          const synced = syncOperatorsFromAgents(next, manifests, {
            createMissingOperators: true
          });
          if (!cancelled) {
            setData(synced);
            setHydrated(true);
          }
          return;
        }

        const legacy = loadOrgChartData();
        const manifests = await loadRuntimeAgentManifests();
        const migrated = syncOperatorsFromAgents(legacy, manifests, {
          createMissingOperators: true
        });
        await runtimeClient.saveOrgChartState(buildPersistedOrgChartState(migrated));
        await runtimeClient.completeLocalStorageMigration().catch(() => undefined);
        if (!cancelled) {
          setData(migrated);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) {
          const legacy = loadOrgChartData();
          setData(
            syncOperatorsFromAgents(legacy, loadAgentManifests(), {
              createMissingOperators: true
            })
          );
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
    const onAgentManifestsChanged = () => {
      void runtimeClient
        .listAgentManifests()
        .then((manifests) => {
          const normalized = normalizeAgentManifestRecords(manifests);
          setData((current) =>
            syncOperatorsFromAgents(current, normalized, {
              createMissingOperators: true
            })
          );
        })
        .catch(() => {
          const manifests = loadAgentManifests();
          setData((current) =>
            syncOperatorsFromAgents(current, manifests, {
              createMissingOperators: true
            })
          );
        });
    };
    window.addEventListener(AGENT_MANIFESTS_CHANGED_EVENT, onAgentManifestsChanged);
    return () => {
      window.removeEventListener(AGENT_MANIFESTS_CHANGED_EVENT, onAgentManifestsChanged);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }
    const payload = {
      ...buildPersistedOrgChartState(data)
    };
    persistTimerRef.current = window.setTimeout(() => {
      void runtimeClient.saveOrgChartState(payload).catch((error) => {
        console.error('Failed to persist org chart state.', error);
      });
    }, 180);

    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [data, hydrated, runtimeClient]);

  const orgUnits = useMemo(() => sortOrgUnits(data.snapshot.orgUnits), [data.snapshot.orgUnits]);
  const businessUnits = useMemo(() => sortBusinessUnits(data.snapshot.businessUnits), [data.snapshot.businessUnits]);
  const operators = useMemo(() => sortActors(data.snapshot.operators), [data.snapshot.operators]);

  const execute = (command: OrgCommand): OrgCommandResult => {
    try {
      setData((current) => executeOrgCommand(current, command));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply org-chart change.';
      return { ok: false, message };
    }
  };

  const refreshFromRuntime = async (): Promise<boolean> => {
    try {
      const remote = await runtimeClient.getOrgChartState();
      if (!remote) {
        return false;
      }
      const next = {
        snapshot: remote.snapshot as OrgChartData['snapshot'],
        activityEvents: [],
        commandHistory: [],
        historyCursor: -1
      } satisfies OrgChartData;
      setData(next);
      return true;
    } catch {
      return false;
    }
  };

  const undo = () => {
    setData((current) => undoOrgCommand(current));
  };

  const redo = () => {
    setData((current) => redoOrgCommand(current));
  };

  const getOrgUnitById = (id: OrgUnitId) => orgUnits.find((unit) => unit.id === id);
  const getBusinessUnitById = (id: BusinessUnitId) => businessUnits.find((unit) => unit.id === id);
  const getOperatorById = (id: OperatorId) => operators.find((operator) => operator.id === id);

  return {
    data,
    businessUnits,
    orgUnits,
    operators,
    links: data.snapshot.links,
    activityEvents: data.activityEvents,
    canUndo: canUndoOrgCommand(data),
    canRedo: canRedoOrgCommand(data),
    execute,
    refreshFromRuntime,
    undo,
    redo,
    getBusinessUnitById,
    getOrgUnitById,
    getOperatorById
  };
}

export function OrgChartStoreProvider({ children }: PropsWithChildren) {
  const value = useOrgChartStoreState();
  return createElement(OrgChartStoreContext.Provider, { value }, children);
}

export function useOrgChartStore(): OrgChartStoreValue {
  const value = useContext(OrgChartStoreContext);
  if (!value) {
    throw new Error('Org chart store missing. Wrap app with OrgChartStoreProvider.');
  }
  return value;
}
