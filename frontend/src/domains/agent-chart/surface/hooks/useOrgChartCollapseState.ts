import { useState, type Dispatch, type SetStateAction } from 'react';

type ScopeBucket = 'unassigned';

type CollapseState = {
  collapsedBusinessUnitIds: Set<string>;
  collapsedOrgUnitIds: Set<string>;
  collapsedActorIds: Set<string>;
  collapsedScopeBuckets: Set<ScopeBucket>;
  setCollapsedBusinessUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedOrgUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedActorIds: Dispatch<SetStateAction<Set<string>>>;
  toggleCollapsedId: (id: string, setter: Dispatch<SetStateAction<Set<string>>>) => void;
  toggleCollapsedScopeBucket: (scope: ScopeBucket) => void;
};

export function useOrgChartCollapseState(): CollapseState {
  const [collapsedBusinessUnitIds, setCollapsedBusinessUnitIds] = useState<Set<string>>(() => new Set());
  const [collapsedOrgUnitIds, setCollapsedOrgUnitIds] = useState<Set<string>>(() => new Set());
  const [collapsedActorIds, setCollapsedActorIds] = useState<Set<string>>(() => new Set());
  const [collapsedScopeBuckets, setCollapsedScopeBuckets] = useState<Set<ScopeBucket>>(() => new Set());

  const toggleCollapsedId = (id: string, setter: Dispatch<SetStateAction<Set<string>>>) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCollapsedScopeBucket = (scope: ScopeBucket) => {
    setCollapsedScopeBuckets((current) => {
      const next = new Set(current);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  return {
    collapsedBusinessUnitIds,
    collapsedOrgUnitIds,
    collapsedActorIds,
    collapsedScopeBuckets,
    setCollapsedBusinessUnitIds,
    setCollapsedOrgUnitIds,
    setCollapsedActorIds,
    toggleCollapsedId,
    toggleCollapsedScopeBucket
  };
}
