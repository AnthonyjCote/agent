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
import {
  canRedoOrgCommand,
  canUndoOrgCommand,
  executeOrgCommand,
  redoOrgCommand,
  undoOrgCommand
} from './commands';
import { loadOrgChartData, saveOrgChartData } from './storage';
import type { ActorId, BusinessUnitId, OrgChartData, OrgCommand, OrgUnitId } from './types';

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

function sortActors(actors: OrgChartData['snapshot']['actors']) {
  return [...actors].sort((a, b) => a.name.localeCompare(b.name));
}

export function useOrgChartStore() {
  const [data, setData] = useState<OrgChartData>(() => loadOrgChartData());

  useEffect(() => {
    saveOrgChartData(data);
  }, [data]);

  const orgUnits = useMemo(() => sortOrgUnits(data.snapshot.orgUnits), [data.snapshot.orgUnits]);
  const businessUnits = useMemo(() => sortBusinessUnits(data.snapshot.businessUnits), [data.snapshot.businessUnits]);
  const actors = useMemo(() => sortActors(data.snapshot.actors), [data.snapshot.actors]);

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
  const getActorById = (id: ActorId) => actors.find((actor) => actor.id === id);

  return {
    data,
    businessUnits,
    orgUnits,
    actors,
    links: data.snapshot.links,
    activityEvents: data.activityEvents,
    canUndo: canUndoOrgCommand(data),
    canRedo: canRedoOrgCommand(data),
    execute,
    undo,
    redo,
    getBusinessUnitById,
    getOrgUnitById,
    getActorById
  };
}
