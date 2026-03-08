/**
 * Purpose: Execute deterministic org-chart commands with validation and link reconciliation.
 * Responsibilities:
 * - Apply canonical mutations for org units and operators.
 * - Enforce cycle and relationship constraints.
 */
// @tags: shared-config,org-chart,commands
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import {
  type Operator,
  type OperatorId,
  type ActivityEvent,
  type BusinessUnit,
  type BusinessUnitId,
  type Link,
  OrgValidationError,
  type OrgChartData,
  type OrgCommand,
  type OrgSnapshot,
  type OrgUnitScope,
  type OrgUnit,
  type OrgUnitId
} from './types';

const APP_ACTOR_ID = 'user_local_v1';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSnapshot(snapshot: OrgSnapshot): OrgSnapshot {
  return {
    businessUnits: (snapshot.businessUnits ?? []).map((unit) => ({ ...unit })),
    orgUnits: (snapshot.orgUnits ?? []).map((unit) => ({ ...unit })),
    operators: (snapshot.operators ?? []).map((operator) => ({ ...operator })),
    links: (snapshot.links ?? []).map((link) => ({ ...link }))
  };
}

function ensureBusinessUnitExists(snapshot: OrgSnapshot, id: BusinessUnitId) {
  if (!snapshot.businessUnits.some((unit) => unit.id === id)) {
    throw new OrgValidationError('business_unit_not_found', `Business unit not found: ${id}`);
  }
}

function ensureOrgUnitExists(snapshot: OrgSnapshot, id: OrgUnitId) {
  if (!snapshot.orgUnits.some((unit) => unit.id === id)) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${id}`);
  }
}

function ensureActorExists(snapshot: OrgSnapshot, id: OperatorId) {
  if (!snapshot.operators.some((operator) => operator.id === id)) {
    throw new OrgValidationError('operator_not_found', `Operator not found: ${id}`);
  }
}

function normalizeBusinessUnitOrder(units: BusinessUnit[], parentId: BusinessUnitId | null) {
  const siblings = units
    .filter((unit) => unit.parentBusinessUnitId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  siblings.forEach((unit, index) => {
    unit.sortOrder = index;
  });
}

function normalizeOrgUnitOrder(units: OrgUnit[], parentId: OrgUnitId | null) {
  const siblings = units
    .filter((unit) => unit.parentOrgUnitId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  siblings.forEach((unit, index) => {
    unit.sortOrder = index;
  });
}

function normalizeActorOrder(operators: Operator[], orgUnitId: OrgUnitId) {
  const siblings = operators
    .filter((operator) => operator.orgUnitId === orgUnitId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  siblings.forEach((operator, index) => {
    // Reuse createdAt order deterministically by writing a stable integer in data bag-equivalent.
    // We keep dedicated order out of operator schema for V1 and rely on creation chronology.
    if (index < 0) {
      throw new Error('Unreachable');
    }
  });
}

function getOrgUnitById(units: OrgUnit[], id: OrgUnitId): OrgUnit | undefined {
  return units.find((unit) => unit.id === id);
}

function getOrgUnitChildren(units: OrgUnit[], parentId: OrgUnitId): OrgUnit[] {
  return units.filter((unit) => unit.parentOrgUnitId === parentId);
}

function collectOrgUnitSubtreeIds(units: OrgUnit[], rootId: OrgUnitId): OrgUnitId[] {
  const collected: OrgUnitId[] = [];
  const queue: OrgUnitId[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift() as OrgUnitId;
    collected.push(current);
    getOrgUnitChildren(units, current).forEach((child) => queue.push(child.id));
  }

  return collected;
}

function getTopLevelOrgUnitId(units: OrgUnit[], orgUnitId: OrgUnitId): OrgUnitId {
  let cursor = getOrgUnitById(units, orgUnitId);
  while (cursor?.parentOrgUnitId) {
    cursor = getOrgUnitById(units, cursor.parentOrgUnitId);
  }
  return cursor?.id ?? orgUnitId;
}

function applyScopeToOrgSubtree(
  units: OrgUnit[],
  rootId: OrgUnitId,
  scope: OrgUnitScope,
  businessUnitId: BusinessUnitId | null
) {
  const now = nowIso();
  const subtreeIds = new Set(collectOrgUnitSubtreeIds(units, rootId));
  units.forEach((unit) => {
    if (!subtreeIds.has(unit.id)) {
      return;
    }
    unit.scope = scope;
    unit.businessUnitId = scope === 'business_unit' ? businessUnitId : null;
    unit.updatedAt = now;
  });
}

function hasOrgUnitCycle(units: OrgUnit[], movedId: OrgUnitId, newParentId: OrgUnitId | null): boolean {
  let cursor = newParentId;
  while (cursor) {
    if (cursor === movedId) {
      return true;
    }
    const next = units.find((unit) => unit.id === cursor)?.parentOrgUnitId ?? null;
    cursor = next;
  }
  return false;
}

function hasBusinessUnitCycle(
  units: BusinessUnit[],
  movedId: BusinessUnitId,
  newParentId: BusinessUnitId | null
): boolean {
  let cursor = newParentId;
  while (cursor) {
    if (cursor === movedId) {
      return true;
    }
    const next = units.find((unit) => unit.id === cursor)?.parentBusinessUnitId ?? null;
    cursor = next;
  }
  return false;
}

function hasActorCycle(operators: Operator[], operatorId: OperatorId, managerOperatorId: OperatorId | null): boolean {
  let cursor = managerOperatorId;
  while (cursor) {
    if (cursor === operatorId) {
      return true;
    }
    const next = operators.find((operator) => operator.id === cursor)?.managerOperatorId ?? null;
    cursor = next;
  }
  return false;
}

function rebuildLinks(snapshot: OrgSnapshot): Link[] {
  const createdAt = nowIso();
  const links: Link[] = [];

  snapshot.businessUnits.forEach((unit) => {
    if (unit.parentBusinessUnitId) {
      links.push({
        id: createId('lnk'),
        fromType: 'business_unit',
        fromId: unit.parentBusinessUnitId,
        toType: 'business_unit',
        toId: unit.id,
        relation: 'business_unit_parent_of_business_unit',
        createdAt
      });
    }
  });

  snapshot.orgUnits.forEach((unit) => {
    if (unit.businessUnitId && snapshot.businessUnits.some((entry) => entry.id === unit.businessUnitId)) {
      links.push({
        id: createId('lnk'),
        fromType: 'business_unit',
        fromId: unit.businessUnitId,
        toType: 'org_unit',
        toId: unit.id,
        relation: 'business_unit_contains_org_unit',
        createdAt
      });
    }

    if (unit.parentOrgUnitId) {
      links.push({
        id: createId('lnk'),
        fromType: 'org_unit',
        fromId: unit.parentOrgUnitId,
        toType: 'org_unit',
        toId: unit.id,
        relation: 'org_unit_parent_of_org_unit',
        createdAt
      });
    }
  });

  snapshot.operators.forEach((operator) => {
    links.push({
      id: createId('lnk'),
      fromType: 'org_unit',
      fromId: operator.orgUnitId,
      toType: 'operator',
      toId: operator.id,
      relation: 'org_unit_contains_operator',
      createdAt
    });

    if (operator.managerOperatorId) {
      links.push({
        id: createId('lnk'),
        fromType: 'operator',
        fromId: operator.managerOperatorId,
        toType: 'operator',
        toId: operator.id,
        relation: 'operator_reports_to_operator',
        createdAt
      });
    }
  });

  return links;
}

function applyCreateBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'create_business_unit' }>
): OrgSnapshot {
  if (command.parentId) {
    ensureBusinessUnitExists(snapshot, command.parentId);
  }

  const timestamp = nowIso();
  const siblings = snapshot.businessUnits.filter((unit) => unit.parentBusinessUnitId === command.parentId);
  const created: BusinessUnit = {
    id: createId('bu'),
    name: command.payload.name.trim() || 'Untitled Business Unit',
    overview: command.payload.overview?.trim() ?? '',
    parentBusinessUnitId: command.parentId,
    logoSourceDataUrl: command.payload.logoSourceDataUrl ?? '',
    logoDataUrl: command.payload.logoDataUrl ?? '',
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const next = cloneSnapshot(snapshot);
  next.businessUnits.push(created);
  next.links = rebuildLinks(next);
  return next;
}

function applyMoveBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'move_business_unit' }>
): OrgSnapshot {
  ensureBusinessUnitExists(snapshot, command.nodeId);
  if (command.newParentId) {
    ensureBusinessUnitExists(snapshot, command.newParentId);
  }

  if (command.nodeId === command.newParentId) {
    throw new OrgValidationError('invalid_move', 'Business unit cannot be moved under itself.');
  }

  if (hasBusinessUnitCycle(snapshot.businessUnits, command.nodeId, command.newParentId)) {
    throw new OrgValidationError('business_unit_cycle_detected', 'Move rejected: business unit hierarchy cycle detected.');
  }

  const next = cloneSnapshot(snapshot);
  const moved = next.businessUnits.find((unit) => unit.id === command.nodeId);
  if (!moved) {
    throw new OrgValidationError('business_unit_not_found', `Business unit not found: ${command.nodeId}`);
  }

  const oldParent = moved.parentBusinessUnitId;
  moved.parentBusinessUnitId = command.newParentId;
  moved.updatedAt = nowIso();

  const targetSiblings = next.businessUnits
    .filter((unit) => unit.parentBusinessUnitId === command.newParentId && unit.id !== moved.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const insertAt =
    command.position == null ? targetSiblings.length : Math.max(0, Math.min(command.position, targetSiblings.length));
  targetSiblings.splice(insertAt, 0, moved);
  targetSiblings.forEach((unit, index) => {
    unit.sortOrder = index;
  });

  if (oldParent !== command.newParentId) {
    normalizeBusinessUnitOrder(next.businessUnits, oldParent);
  }

  next.links = rebuildLinks(next);
  return next;
}

function applyRenameBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'rename_business_unit' }>
): OrgSnapshot {
  ensureBusinessUnitExists(snapshot, command.nodeId);

  const next = cloneSnapshot(snapshot);
  const unit = next.businessUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('business_unit_not_found', `Business unit not found: ${command.nodeId}`);
  }

  unit.name = command.name.trim() || unit.name;
  unit.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyUpdateBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'update_business_unit' }>
): OrgSnapshot {
  ensureBusinessUnitExists(snapshot, command.nodeId);
  const next = cloneSnapshot(snapshot);
  const unit = next.businessUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('business_unit_not_found', `Business unit not found: ${command.nodeId}`);
  }

  if (command.patch.name != null) {
    unit.name = command.patch.name.trim() || unit.name;
  }
  if (command.patch.overview != null) {
    unit.overview = command.patch.overview;
  }
  unit.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyCreateOrgUnit(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'create_org_unit' }>): OrgSnapshot {
  let inheritedBusinessUnitId: BusinessUnitId | null = null;
  let inheritedScope: OrgUnitScope = command.payload.rootScope ?? 'unassigned';
  if (command.parentId) {
    ensureOrgUnitExists(snapshot, command.parentId);
    const parent = snapshot.orgUnits.find((unit) => unit.id === command.parentId);
    inheritedBusinessUnitId = parent?.businessUnitId ?? null;
    inheritedScope = parent?.scope ?? inheritedScope;
  } else if (command.payload.rootScope === 'business_unit') {
    inheritedBusinessUnitId = command.payload.rootBusinessUnitId ?? null;
    if (inheritedBusinessUnitId) {
      ensureBusinessUnitExists(snapshot, inheritedBusinessUnitId);
    }
  }

  const timestamp = nowIso();
  const siblings = snapshot.orgUnits.filter((unit) => unit.parentOrgUnitId === command.parentId);
  const created: OrgUnit = {
    id: createId('org'),
    name: command.payload.name.trim() || 'Untitled Org Unit',
    overview: command.payload.overview?.trim() ?? '',
    coreResponsibilities: command.payload.coreResponsibilities?.trim() ?? '',
    primaryDeliverables: command.payload.primaryDeliverables?.trim() ?? '',
    workingModel: command.payload.workingModel ?? 'hybrid',
    parentOrgUnitId: command.parentId,
    scope: inheritedScope,
    businessUnitId: inheritedBusinessUnitId,
    iconSourceDataUrl: command.payload.iconSourceDataUrl ?? '',
    iconDataUrl: command.payload.iconDataUrl ?? '',
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const next = cloneSnapshot(snapshot);
  next.orgUnits.push(created);
  next.links = rebuildLinks(next);
  return next;
}

function applyAssignOrgUnitBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'assign_org_unit_business_unit' }>
): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.orgUnitId);
  if (command.businessUnitId) {
    ensureBusinessUnitExists(snapshot, command.businessUnitId);
  }

  const next = cloneSnapshot(snapshot);
  const orgUnit = next.orgUnits.find((item) => item.id === command.orgUnitId);
  if (!orgUnit) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.orgUnitId}`);
  }
  const topLevelOrgUnitId = getTopLevelOrgUnitId(next.orgUnits, orgUnit.id);
  if (command.businessUnitId) {
    applyScopeToOrgSubtree(next.orgUnits, topLevelOrgUnitId, 'business_unit', command.businessUnitId);
  } else {
    applyScopeToOrgSubtree(next.orgUnits, topLevelOrgUnitId, 'unassigned', null);
  }
  next.links = rebuildLinks(next);
  return next;
}

function applySetOrgUnitScope(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'set_org_unit_scope' }>
): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.orgUnitId);
  if (command.scope === 'business_unit' && command.businessUnitId) {
    ensureBusinessUnitExists(snapshot, command.businessUnitId);
  }
  if (command.scope === 'business_unit' && !command.businessUnitId) {
    throw new OrgValidationError('validation_error', 'Business unit selection is required for business-unit scope.');
  }

  const next = cloneSnapshot(snapshot);
  const orgUnit = next.orgUnits.find((item) => item.id === command.orgUnitId);
  if (!orgUnit) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.orgUnitId}`);
  }

  const topLevelOrgUnitId = getTopLevelOrgUnitId(next.orgUnits, orgUnit.id);
  applyScopeToOrgSubtree(
    next.orgUnits,
    topLevelOrgUnitId,
    command.scope,
    command.scope === 'business_unit' ? command.businessUnitId ?? null : null
  );
  next.links = rebuildLinks(next);
  return next;
}

function applyCreateActor(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'create_operator' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.targetOrgUnitId);

  const timestamp = nowIso();
  const created: Operator = {
    id: createId('act'),
    sourceAgentId: command.payload.sourceAgentId ?? null,
    name: command.payload.name.trim() || 'New Operator',
    title: command.payload.title.trim() || 'Role',
    primaryObjective: command.payload.primaryObjective?.trim() ?? '',
    systemDirective: command.payload.systemDirective?.trim() ?? '',
    roleBrief: command.payload.roleBrief?.trim() ?? '',
    kind: command.payload.kind,
    orgUnitId: command.targetOrgUnitId,
    managerOperatorId: null,
    avatarSourceDataUrl: command.payload.avatarSourceDataUrl ?? '',
    avatarDataUrl: command.payload.avatarDataUrl ?? '',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const next = cloneSnapshot(snapshot);
  next.operators.push(created);
  normalizeActorOrder(next.operators, command.targetOrgUnitId);
  next.links = rebuildLinks(next);
  return next;
}

function applyMoveOrgUnit(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'move_org_unit' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.nodeId);
  if (command.newParentId) {
    ensureOrgUnitExists(snapshot, command.newParentId);
  }

  if (command.nodeId === command.newParentId) {
    throw new OrgValidationError('invalid_move', 'Org unit cannot be moved under itself.');
  }

  if (hasOrgUnitCycle(snapshot.orgUnits, command.nodeId, command.newParentId)) {
    throw new OrgValidationError('org_cycle_detected', 'Move rejected: org hierarchy cycle detected.');
  }

  const next = cloneSnapshot(snapshot);
  const moved = next.orgUnits.find((unit) => unit.id === command.nodeId);

  if (!moved) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.nodeId}`);
  }

  const oldParent = moved.parentOrgUnitId;
  moved.parentOrgUnitId = command.newParentId;
  moved.updatedAt = nowIso();

  const targetSiblings = next.orgUnits
    .filter((unit) => unit.parentOrgUnitId === command.newParentId && unit.id !== moved.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const insertAt = command.position == null ? targetSiblings.length : Math.max(0, Math.min(command.position, targetSiblings.length));
  targetSiblings.splice(insertAt, 0, moved);
  targetSiblings.forEach((unit, index) => {
    unit.sortOrder = index;
  });

  if (oldParent !== command.newParentId) {
    normalizeOrgUnitOrder(next.orgUnits, oldParent);
  }

  const inheritedBusinessUnitId = command.newParentId
    ? getOrgUnitById(next.orgUnits, command.newParentId)?.businessUnitId ?? null
    : moved.businessUnitId;
  const inheritedScope = command.newParentId
    ? getOrgUnitById(next.orgUnits, command.newParentId)?.scope ?? moved.scope
    : moved.scope;
  applyScopeToOrgSubtree(next.orgUnits, moved.id, inheritedScope, inheritedBusinessUnitId);

  next.links = rebuildLinks(next);
  return next;
}

function applyMoveActor(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'move_operator' }>): OrgSnapshot {
  ensureActorExists(snapshot, command.operatorId);
  ensureOrgUnitExists(snapshot, command.targetOrgUnitId);

  const next = cloneSnapshot(snapshot);
  const operator = next.operators.find((item) => item.id === command.operatorId);
  if (!operator) {
    throw new OrgValidationError('operator_not_found', `Operator not found: ${command.operatorId}`);
  }

  const oldOrgUnitId = operator.orgUnitId;
  operator.orgUnitId = command.targetOrgUnitId;
  operator.updatedAt = nowIso();

  normalizeActorOrder(next.operators, oldOrgUnitId);
  normalizeActorOrder(next.operators, command.targetOrgUnitId);
  next.links = rebuildLinks(next);
  return next;
}

function applySetActorManager(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'set_operator_manager' }>): OrgSnapshot {
  ensureActorExists(snapshot, command.operatorId);
  if (command.managerOperatorId) {
    ensureActorExists(snapshot, command.managerOperatorId);
  }

  if (command.operatorId === command.managerOperatorId) {
    throw new OrgValidationError('invalid_move', 'Operator cannot report to itself.');
  }

  if (hasActorCycle(snapshot.operators, command.operatorId, command.managerOperatorId)) {
    throw new OrgValidationError('operator_cycle_detected', 'Manager update rejected: reporting cycle detected.');
  }

  const next = cloneSnapshot(snapshot);
  const operator = next.operators.find((item) => item.id === command.operatorId);
  if (!operator) {
    throw new OrgValidationError('operator_not_found', `Operator not found: ${command.operatorId}`);
  }

  operator.managerOperatorId = command.managerOperatorId;
  operator.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyRenameOrgUnit(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'rename_org_unit' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.nodeId);

  const next = cloneSnapshot(snapshot);
  const unit = next.orgUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.nodeId}`);
  }

  unit.name = command.name.trim() || unit.name;
  unit.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyUpdateOrgUnit(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'update_org_unit' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.nodeId);
  const next = cloneSnapshot(snapshot);
  const unit = next.orgUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.nodeId}`);
  }

  if (command.patch.name != null) {
    unit.name = command.patch.name.trim() || unit.name;
  }
  if (command.patch.overview != null) {
    unit.overview = command.patch.overview;
  }
  if (command.patch.coreResponsibilities != null) {
    unit.coreResponsibilities = command.patch.coreResponsibilities;
  }
  if (command.patch.primaryDeliverables != null) {
    unit.primaryDeliverables = command.patch.primaryDeliverables;
  }
  if (command.patch.workingModel != null) {
    unit.workingModel = command.patch.workingModel;
  }
  unit.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyUpdateActor(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'update_operator' }>): OrgSnapshot {
  ensureActorExists(snapshot, command.operatorId);

  const next = cloneSnapshot(snapshot);
  const operator = next.operators.find((item) => item.id === command.operatorId);
  if (!operator) {
    throw new OrgValidationError('operator_not_found', `Operator not found: ${command.operatorId}`);
  }

  if (command.patch.name != null) {
    operator.name = command.patch.name.trim() || operator.name;
  }
  if (command.patch.title != null) {
    operator.title = command.patch.title.trim() || operator.title;
  }
  if (command.patch.kind != null) {
    operator.kind = command.patch.kind;
  }
  if (command.patch.primaryObjective != null) {
    operator.primaryObjective = command.patch.primaryObjective;
  }
  if (command.patch.systemDirective != null) {
    operator.systemDirective = command.patch.systemDirective;
  }
  if (command.patch.roleBrief != null) {
    operator.roleBrief = command.patch.roleBrief;
  }

  operator.updatedAt = nowIso();
  next.links = rebuildLinks(next);
  return next;
}

function applyDeleteActor(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'delete_operator' }>): OrgSnapshot {
  ensureActorExists(snapshot, command.operatorId);
  const next = cloneSnapshot(snapshot);
  const removedIds = new Set([command.operatorId]);

  next.operators = next.operators
    .filter((operator) => operator.id !== command.operatorId)
    .map((operator) => ({
      ...operator,
      managerOperatorId: operator.managerOperatorId && removedIds.has(operator.managerOperatorId) ? null : operator.managerOperatorId
    }));

  next.links = rebuildLinks(next);
  return next;
}

function applyDeleteOrgUnit(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'delete_org_unit' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.nodeId);
  const next = cloneSnapshot(snapshot);
  const target = next.orgUnits.find((unit) => unit.id === command.nodeId);
  if (!target) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.nodeId}`);
  }

  const removedOrgIds = new Set(collectOrgUnitSubtreeIds(next.orgUnits, command.nodeId));
  const removedActorIds = new Set(next.operators.filter((operator) => removedOrgIds.has(operator.orgUnitId)).map((operator) => operator.id));

  next.orgUnits = next.orgUnits.filter((unit) => !removedOrgIds.has(unit.id));
  next.operators = next.operators
    .filter((operator) => !removedActorIds.has(operator.id))
    .map((operator) => ({
      ...operator,
      managerOperatorId: operator.managerOperatorId && removedActorIds.has(operator.managerOperatorId) ? null : operator.managerOperatorId
    }));

  normalizeOrgUnitOrder(next.orgUnits, target.parentOrgUnitId);
  next.links = rebuildLinks(next);
  return next;
}

function applyDeleteBusinessUnit(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'delete_business_unit' }>
): OrgSnapshot {
  ensureBusinessUnitExists(snapshot, command.nodeId);
  if (snapshot.businessUnits.some((unit) => unit.parentBusinessUnitId === command.nodeId)) {
    throw new OrgValidationError(
      'validation_error',
      'Cannot delete business unit while child business units exist. Reassign or remove children first.'
    );
  }
  if (snapshot.orgUnits.some((unit) => unit.scope === 'business_unit' && unit.businessUnitId === command.nodeId)) {
    throw new OrgValidationError(
      'validation_error',
      'Cannot delete business unit while org units are assigned. Reassign org units first.'
    );
  }

  const next = cloneSnapshot(snapshot);
  const removed = next.businessUnits.find((unit) => unit.id === command.nodeId);
  next.businessUnits = next.businessUnits.filter((unit) => unit.id !== command.nodeId);
  normalizeBusinessUnitOrder(next.businessUnits, removed?.parentBusinessUnitId ?? null);
  next.links = rebuildLinks(next);
  return next;
}

function applySetBusinessUnitLogo(
  snapshot: OrgSnapshot,
  command: Extract<OrgCommand, { kind: 'set_business_unit_logo' }>
): OrgSnapshot {
  ensureBusinessUnitExists(snapshot, command.nodeId);
  const next = cloneSnapshot(snapshot);
  const unit = next.businessUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('business_unit_not_found', `Business unit not found: ${command.nodeId}`);
  }
  unit.logoSourceDataUrl = command.sourceDataUrl;
  unit.logoDataUrl = command.croppedDataUrl;
  unit.updatedAt = nowIso();
  return next;
}

function applySetOrgUnitIcon(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'set_org_unit_icon' }>): OrgSnapshot {
  ensureOrgUnitExists(snapshot, command.nodeId);
  const next = cloneSnapshot(snapshot);
  const unit = next.orgUnits.find((item) => item.id === command.nodeId);
  if (!unit) {
    throw new OrgValidationError('org_unit_not_found', `Org unit not found: ${command.nodeId}`);
  }
  unit.iconSourceDataUrl = command.sourceDataUrl;
  unit.iconDataUrl = command.croppedDataUrl;
  unit.updatedAt = nowIso();
  return next;
}

function applySetActorAvatar(snapshot: OrgSnapshot, command: Extract<OrgCommand, { kind: 'set_operator_avatar' }>): OrgSnapshot {
  ensureActorExists(snapshot, command.operatorId);
  const next = cloneSnapshot(snapshot);
  const operator = next.operators.find((item) => item.id === command.operatorId);
  if (!operator) {
    throw new OrgValidationError('operator_not_found', `Operator not found: ${command.operatorId}`);
  }
  operator.avatarSourceDataUrl = command.sourceDataUrl;
  operator.avatarDataUrl = command.croppedDataUrl;
  operator.updatedAt = nowIso();
  return next;
}

function applyCommandToSnapshot(snapshot: OrgSnapshot, command: OrgCommand): OrgSnapshot {
  switch (command.kind) {
    case 'create_business_unit':
      return applyCreateBusinessUnit(snapshot, command);
    case 'move_business_unit':
      return applyMoveBusinessUnit(snapshot, command);
    case 'rename_business_unit':
      return applyRenameBusinessUnit(snapshot, command);
    case 'update_business_unit':
      return applyUpdateBusinessUnit(snapshot, command);
    case 'create_org_unit':
      return applyCreateOrgUnit(snapshot, command);
    case 'assign_org_unit_business_unit':
      return applyAssignOrgUnitBusinessUnit(snapshot, command);
    case 'set_org_unit_scope':
      return applySetOrgUnitScope(snapshot, command);
    case 'create_operator':
      return applyCreateActor(snapshot, command);
    case 'move_org_unit':
      return applyMoveOrgUnit(snapshot, command);
    case 'move_operator':
      return applyMoveActor(snapshot, command);
    case 'set_operator_manager':
      return applySetActorManager(snapshot, command);
    case 'rename_org_unit':
      return applyRenameOrgUnit(snapshot, command);
    case 'update_org_unit':
      return applyUpdateOrgUnit(snapshot, command);
    case 'update_operator':
      return applyUpdateActor(snapshot, command);
    case 'delete_business_unit':
      return applyDeleteBusinessUnit(snapshot, command);
    case 'delete_org_unit':
      return applyDeleteOrgUnit(snapshot, command);
    case 'delete_operator':
      return applyDeleteActor(snapshot, command);
    case 'set_business_unit_logo':
      return applySetBusinessUnitLogo(snapshot, command);
    case 'set_org_unit_icon':
      return applySetOrgUnitIcon(snapshot, command);
    case 'set_operator_avatar':
      return applySetActorAvatar(snapshot, command);
    default:
      throw new OrgValidationError('validation_error', 'Unsupported org command.');
  }
}

function pushActivityEvent(
  events: ActivityEvent[],
  eventType: string,
  data: Record<string, unknown>,
  entityType: 'business_unit' | 'org_unit' | 'operator' | 'org_chart' = 'org_chart',
  entityId = 'org_chart_v1'
) {
  events.push({
    id: createId('evt'),
    entityType,
    entityId,
    eventType,
    operatorId: APP_ACTOR_ID,
    timestamp: nowIso(),
    data
  });
}

function cloneData(data: OrgChartData): OrgChartData {
  return {
    snapshot: cloneSnapshot(data.snapshot),
    activityEvents: (data.activityEvents ?? []).map((event) => ({ ...event })),
    commandHistory: (data.commandHistory ?? []).map((entry) => ({
      ...entry,
      before: cloneSnapshot(entry.before),
      after: cloneSnapshot(entry.after)
    })),
    historyCursor: data.historyCursor ?? -1
  };
}

export function executeOrgCommand(data: OrgChartData, command: OrgCommand): OrgChartData {
  const next = cloneData(data);
  const before = cloneSnapshot(next.snapshot);
  const after = applyCommandToSnapshot(before, command);
  const executedAt = nowIso();

  if (next.historyCursor < next.commandHistory.length - 1) {
    next.commandHistory = next.commandHistory.slice(0, next.historyCursor + 1);
  }

  next.commandHistory.push({
    id: createId('cmd'),
    command,
    operatorId: APP_ACTOR_ID,
    executedAt,
    before,
    after
  });

  next.historyCursor = next.commandHistory.length - 1;
  next.snapshot = after;

  pushActivityEvent(next.activityEvents, `command_${command.kind}`, { command }, 'org_chart', 'org_chart_v1');
  return next;
}

export function undoOrgCommand(data: OrgChartData): OrgChartData {
  if (data.historyCursor < 0) {
    return data;
  }

  const next = cloneData(data);
  const entry = next.commandHistory[next.historyCursor];
  next.snapshot = cloneSnapshot(entry.before);
  next.historyCursor -= 1;

  pushActivityEvent(next.activityEvents, 'command_undo', { commandId: entry.id }, 'org_chart', 'org_chart_v1');
  return next;
}

export function redoOrgCommand(data: OrgChartData): OrgChartData {
  const nextIndex = data.historyCursor + 1;
  if (nextIndex >= data.commandHistory.length) {
    return data;
  }

  const next = cloneData(data);
  const entry = next.commandHistory[nextIndex];
  next.snapshot = cloneSnapshot(entry.after);
  next.historyCursor = nextIndex;

  pushActivityEvent(next.activityEvents, 'command_redo', { commandId: entry.id }, 'org_chart', 'org_chart_v1');
  return next;
}

export function canUndoOrgCommand(data: OrgChartData): boolean {
  return data.historyCursor >= 0;
}

export function canRedoOrgCommand(data: OrgChartData): boolean {
  return data.historyCursor + 1 < data.commandHistory.length;
}
