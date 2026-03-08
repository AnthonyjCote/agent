import type { SelectedNode } from '../surface/types';

type OrgEditPermissionContext = {
  sessionRole?: 'owner' | 'admin' | 'member' | 'viewer';
  readOnlyMode?: boolean;
};

export function canEditOrgNode(context: OrgEditPermissionContext, selectedNode: SelectedNode): boolean {
  if (!selectedNode || selectedNode.kind === 'scope_bucket') {
    return false;
  }
  if (context.readOnlyMode) {
    return false;
  }
  const role = context.sessionRole ?? 'owner';
  return role === 'owner' || role === 'admin';
}
