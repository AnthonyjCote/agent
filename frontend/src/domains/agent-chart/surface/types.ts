import type { OrgUnitScope } from '../../../shared/config';

export type SelectedNode =
  | { kind: 'business_unit'; id: string }
  | { kind: 'scope_bucket'; scope: Exclude<OrgUnitScope, 'business_unit'> }
  | { kind: 'org_unit'; id: string }
  | { kind: 'actor'; id: string }
  | null;

export type BusinessUnitTreeNode = {
  id: string;
  name: string;
  children: BusinessUnitTreeNode[];
};

export type PendingDelete =
  | { kind: 'business_unit'; id: string; label: string }
  | { kind: 'org_unit'; id: string; label: string }
  | { kind: 'actor'; id: string; label: string }
  | null;

export type PendingMediaTarget =
  | { kind: 'business_unit'; id: string }
  | { kind: 'org_unit'; id: string }
  | { kind: 'actor'; id: string }
  | null;

