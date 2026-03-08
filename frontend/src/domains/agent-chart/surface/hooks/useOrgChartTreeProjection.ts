import { useMemo } from 'react';
import { buildOrgUnitTree, type OrgUnitTreeNode } from '../../model';
import type { Operator, BusinessUnit, OrgUnit } from '../../../../shared/config';
import type { BusinessUnitTreeNode } from '../types';

export type OrgChartTreeProjection = {
  orgTree: OrgUnitTreeNode[];
  businessUnitTree: BusinessUnitTreeNode[];
  orgRootsByBusinessUnit: Map<string, OrgUnitTreeNode[]>;
  sharedOrgRoots: OrgUnitTreeNode[];
  unassignedOrgRoots: OrgUnitTreeNode[];
  reportCountByManager: Map<string, number>;
};

export function useOrgChartTreeProjection(input: {
  operators: Operator[];
  orgUnits: OrgUnit[];
  businessUnits: BusinessUnit[];
}): OrgChartTreeProjection {
  const { operators, orgUnits, businessUnits } = input;

  const orgTree = useMemo(() => buildOrgUnitTree(orgUnits), [orgUnits]);

  const reportCountByManager = useMemo(() => {
    const map = new Map<string, number>();
    operators.forEach((operator) => {
      if (!operator.managerOperatorId) {
        return;
      }
      map.set(operator.managerOperatorId, (map.get(operator.managerOperatorId) ?? 0) + 1);
    });
    return map;
  }, [operators]);

  const businessUnitTree = useMemo<BusinessUnitTreeNode[]>(() => {
    const byParent = new Map<string | null, BusinessUnit[]>();
    businessUnits.forEach((unit) => {
      const bucket = byParent.get(unit.parentBusinessUnitId) ?? [];
      bucket.push(unit);
      byParent.set(unit.parentBusinessUnitId, bucket);
    });
    byParent.forEach((bucket) => {
      bucket.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    });

    const buildNode = (id: string): BusinessUnitTreeNode => {
      const unit = businessUnits.find((entry) => entry.id === id);
      if (!unit) {
        return { id, name: 'Business Unit', children: [] };
      }
      const children = (byParent.get(id) ?? []).map((entry) => buildNode(entry.id));
      return { id: unit.id, name: unit.name, children };
    };

    return (byParent.get(null) ?? []).map((unit) => buildNode(unit.id));
  }, [businessUnits]);

  const topLevelOrgRoots = useMemo(() => orgTree.filter((node) => node.unit.parentOrgUnitId == null), [orgTree]);

  const orgRootsByBusinessUnit = useMemo(() => {
    const map = new Map<string, OrgUnitTreeNode[]>();
    topLevelOrgRoots.forEach((node) => {
      if (node.unit.scope !== 'business_unit' || !node.unit.businessUnitId) {
        return;
      }
      const bucket = map.get(node.unit.businessUnitId) ?? [];
      bucket.push(node);
      map.set(node.unit.businessUnitId, bucket);
    });
    map.forEach((bucket) => bucket.sort((a, b) => a.unit.sortOrder - b.unit.sortOrder || a.unit.name.localeCompare(b.unit.name)));
    return map;
  }, [topLevelOrgRoots]);

  const sharedOrgRoots = useMemo(
    () =>
      topLevelOrgRoots
        .filter((node) => node.unit.scope === 'shared')
        .sort((a, b) => a.unit.sortOrder - b.unit.sortOrder || a.unit.name.localeCompare(b.unit.name)),
    [topLevelOrgRoots]
  );

  const unassignedOrgRoots = useMemo(
    () =>
      topLevelOrgRoots
        .filter((node) => node.unit.scope === 'unassigned' || node.unit.scope == null)
        .sort((a, b) => a.unit.sortOrder - b.unit.sortOrder || a.unit.name.localeCompare(b.unit.name)),
    [topLevelOrgRoots]
  );

  return {
    orgTree,
    businessUnitTree,
    orgRootsByBusinessUnit,
    sharedOrgRoots,
    unassignedOrgRoots,
    reportCountByManager
  };
}
