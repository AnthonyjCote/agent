/**
 * Purpose: Build tree projections for org-unit and operator hierarchy rendering.
 * Responsibilities:
 * - Project org unit parent-child relationships into a nested tree.
 * - Project operator reporting relationships for per-unit rendering.
 */
// @tags: domain,agent-chart,model,tree
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import type { Operator, OrgUnit } from '../../../shared/config';

export type OrgUnitTreeNode = {
  unit: OrgUnit;
  children: OrgUnitTreeNode[];
};

export type OperatorTreeNode = {
  operator: Operator;
  children: OperatorTreeNode[];
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

export function buildOperatorTree(operators: Operator[], orgUnitId: string): OperatorTreeNode[] {
  const inUnit = operators.filter((operator) => operator.orgUnitId === orgUnitId);
  const actorById = new Map(inUnit.map((operator) => [operator.id, operator]));
  const byManager = new Map<string | null, Operator[]>();

  inUnit.forEach((operator) => {
    const managerInUnit = operator.managerOperatorId && actorById.has(operator.managerOperatorId) ? operator.managerOperatorId : null;
    const bucket = byManager.get(managerInUnit) ?? [];
    bucket.push(operator);
    byManager.set(managerInUnit, bucket);
  });

  byManager.forEach((bucket) => {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  });

  const buildNode = (operator: Operator): OperatorTreeNode => ({
    operator,
    children: (byManager.get(operator.id) ?? []).map(buildNode)
  });

  return (byManager.get(null) ?? []).map(buildNode);
}
