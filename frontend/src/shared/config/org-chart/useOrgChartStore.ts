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

import { useEffect, useMemo, useState } from 'react';
import { AGENT_MANIFESTS_CHANGED_EVENT, loadAgentManifests } from '../agents/agent-storage';
import type { AgentManifest } from '../agents';
import {
  canRedoOrgCommand,
  canUndoOrgCommand,
  executeOrgCommand,
  redoOrgCommand,
  undoOrgCommand
} from './commands';
import { loadOrgChartData, saveOrgChartData } from './storage';
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

function syncOperatorsFromAgents(current: OrgChartData): OrgChartData {
  const manifests = loadAgentManifests();
  if (manifests.length === 0) {
    return current;
  }

  let next = current;
  let changed = false;

  const apply = (command: OrgCommand) => {
    next = executeOrgCommand(next, command);
    changed = true;
  };

  if (next.snapshot.orgUnits.length === 0) {
    apply({
      kind: 'create_org_unit',
      parentId: null,
      payload: {
        name: 'Unassigned Operators',
        shortDescription: 'Default org unit for imported agents.'
      }
    });
  }

  const defaultOrgUnitId = next.snapshot.orgUnits[0]?.id;
  if (!defaultOrgUnitId) {
    return next;
  }

  const bySourceAgentId = new Map(
    next.snapshot.operators
      .filter((operator) => typeof operator.sourceAgentId === 'string' && operator.sourceAgentId.length > 0)
      .map((operator) => [operator.sourceAgentId as string, operator])
  );
  const manifestIds = new Set(manifests.map((manifest) => manifest.agentId));

  manifests.forEach((manifest: AgentManifest) => {
    const existing = bySourceAgentId.get(manifest.agentId);
    if (!existing) {
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

export function useOrgChartStore() {
  const [data, setData] = useState<OrgChartData>(() => syncOperatorsFromAgents(loadOrgChartData()));

  useEffect(() => {
    saveOrgChartData(data);
  }, [data]);

  useEffect(() => {
    const syncNow = () => {
      setData((current) => syncOperatorsFromAgents(current));
    };

    syncNow();
    window.addEventListener(AGENT_MANIFESTS_CHANGED_EVENT, syncNow);
    return () => {
      window.removeEventListener(AGENT_MANIFESTS_CHANGED_EVENT, syncNow);
    };
  }, []);

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
    undo,
    redo,
    getBusinessUnitById,
    getOrgUnitById,
    getOperatorById
  };
}
