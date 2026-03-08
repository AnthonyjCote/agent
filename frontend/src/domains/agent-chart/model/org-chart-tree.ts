/**
 * Purpose: Build tree projections for org-unit and actor hierarchy rendering.
 * Responsibilities:
 * - Project org unit parent-child relationships into a nested tree.
 * - Project actor reporting relationships for per-unit rendering.
 */
// @tags: domain,agent-chart,model,tree
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import type { Actor, OrgUnit } from '../../../shared/config';

export type OrgUnitTreeNode = {
  unit: OrgUnit;
  children: OrgUnitTreeNode[];
};

export type ActorTreeNode = {
  actor: Actor;
  children: ActorTreeNode[];
};

export function buildOrgUnitTree(units: OrgUnit[]): OrgUnitTreeNode[] {
  const byParent = new Map<string | null, OrgUnit[]>();

  units.forEach((unit) => {
    const bucket = byParent.get(unit.parentOrgUnitId) ?? [];
    bucket.push(unit);
    byParent.set(unit.parentOrgUnitId, bucket);
  });

  byParent.forEach((bucket) => {
    bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  });

  const buildNode = (unit: OrgUnit): OrgUnitTreeNode => ({
    unit,
    children: (byParent.get(unit.id) ?? []).map(buildNode)
  });

  return (byParent.get(null) ?? []).map(buildNode);
}

export function buildActorTree(actors: Actor[], orgUnitId: string): ActorTreeNode[] {
  const inUnit = actors.filter((actor) => actor.orgUnitId === orgUnitId);
  const actorById = new Map(inUnit.map((actor) => [actor.id, actor]));
  const byManager = new Map<string | null, Actor[]>();

  inUnit.forEach((actor) => {
    const managerInUnit = actor.managerActorId && actorById.has(actor.managerActorId) ? actor.managerActorId : null;
    const bucket = byManager.get(managerInUnit) ?? [];
    bucket.push(actor);
    byManager.set(managerInUnit, bucket);
  });

  byManager.forEach((bucket) => {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  });

  const buildNode = (actor: Actor): ActorTreeNode => ({
    actor,
    children: (byManager.get(actor.id) ?? []).map(buildNode)
  });

  return (byManager.get(null) ?? []).map(buildNode);
}
