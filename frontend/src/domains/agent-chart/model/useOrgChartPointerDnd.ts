/**
 * Purpose: Provide custom pointer-driven drag-and-drop runtime for org-chart tree rows.
 * Responsibilities:
 * - Track drag candidate/active drag state outside native HTML DnD.
 * - Resolve row hit targets and placement indicators.
 * - Map resolved drops to canonical org-chart commands.
 */
// @tags: domain,agent-chart,model,dnd
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Operator, BusinessUnit, OrgCommand, OrgUnit } from '@/shared/config';

type DragPayload =
  | { kind: 'org_unit'; id: string }
  | {
      kind: 'operator';
      id: string;
    };

type RowKind = 'org_unit' | 'operator';
type ScopeBucketId = 'unassigned';
type ExtendedRowKind = RowKind | 'business_unit' | 'scope_bucket';

type RowEntry = {
  kind: ExtendedRowKind;
  id: string;
  element: HTMLButtonElement;
};

type Placement = 'inside' | 'before' | 'after';

type DropTarget = {
  kind: ExtendedRowKind;
  id: string;
  placement: Placement;
};

type DragCandidate = {
  pointerId: number;
  startX: number;
  startY: number;
  payload: DragPayload;
};

type ActiveDrag = {
  pointerId: number;
  clientX: number;
  clientY: number;
  payload: DragPayload;
};

type UseOrgChartPointerDndInput = {
  enabled: boolean;
  orgUnits: OrgUnit[];
  businessUnits: BusinessUnit[];
  operators: Operator[];
  onCommand: (command: OrgCommand) => void;
};

function movementExceededThreshold(candidate: DragCandidate, clientX: number, clientY: number): boolean {
  const dx = clientX - candidate.startX;
  const dy = clientY - candidate.startY;
  return Math.sqrt(dx * dx + dy * dy) >= 6;
}

function resolvePlacement(payload: DragPayload, row: RowEntry, pointerY: number): Placement {
  if (!(payload.kind === 'org_unit' && row.kind === 'org_unit')) {
    return 'inside';
  }

  const rect = row.element.getBoundingClientRect();
  const localY = pointerY - rect.top;
  const edge = Math.max(6, Math.min(10, rect.height * 0.2));

  if (localY <= edge) {
    return 'before';
  }

  if (localY >= rect.height - edge) {
    return 'after';
  }

  return 'inside';
}

function resolveHitRow(rows: RowEntry[], clientX: number, clientY: number): RowEntry | null {
  let winner: RowEntry | null = null;
  let winnerArea = Number.POSITIVE_INFINITY;

  rows.forEach((row) => {
    const rect = row.element.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) {
      return;
    }

    const area = rect.width * rect.height;
    if (area < winnerArea) {
      winner = row;
      winnerArea = area;
    }
  });

  return winner;
}

function isDropAllowed(payload: DragPayload, target: DropTarget): boolean {
  if (payload.kind === 'operator') {
    if (target.kind === 'org_unit') {
      return target.placement === 'inside';
    }

    if (target.kind === 'operator') {
      return target.placement === 'inside' && payload.id !== target.id;
    }

    return false;
  }

  if (payload.kind === 'org_unit') {
    if (target.kind === 'org_unit') {
      if (payload.id === target.id) {
        return false;
      }
      return target.placement === 'inside' || target.placement === 'before' || target.placement === 'after';
    }
    if (target.kind === 'business_unit' || target.kind === 'scope_bucket') {
      return target.placement === 'inside';
    }
    return false;
  }

  return false;
}

function buildMoveOrgUnitCommandFromPlacement(
  payload: { kind: 'org_unit'; id: string },
  target: { kind: 'org_unit'; id: string; placement: Placement },
  orgUnits: OrgUnit[]
): OrgCommand | null {
  if (target.placement === 'inside') {
    return {
      kind: 'move_org_unit',
      nodeId: payload.id,
      newParentId: target.id
    };
  }

  const targetUnit = orgUnits.find((unit) => unit.id === target.id);
  if (!targetUnit) {
    return null;
  }

  const parentId = targetUnit.parentOrgUnitId;
  const siblings = orgUnits
    .filter((unit) => unit.parentOrgUnitId === parentId && unit.id !== payload.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const targetIndex = siblings.findIndex((unit) => unit.id === target.id);
  const base = targetIndex < 0 ? siblings.length : targetIndex;
  const position = target.placement === 'before' ? base : base + 1;

  return {
    kind: 'move_org_unit',
    nodeId: payload.id,
    newParentId: parentId,
    position
  };
}

function buildCommand(payload: DragPayload, target: DropTarget, orgUnits: OrgUnit[]): OrgCommand | null {
  if (payload.kind === 'operator' && target.kind === 'org_unit' && target.placement === 'inside') {
    return {
      kind: 'move_operator',
      operatorId: payload.id,
      targetOrgUnitId: target.id
    };
  }

  if (payload.kind === 'operator' && target.kind === 'operator' && target.placement === 'inside') {
    return {
      kind: 'set_operator_manager',
      operatorId: payload.id,
      managerOperatorId: target.id
    };
  }

  if (payload.kind === 'org_unit' && target.kind === 'org_unit') {
    return buildMoveOrgUnitCommandFromPlacement(
      payload,
      { kind: 'org_unit', id: target.id, placement: target.placement },
      orgUnits
    );
  }

  if (payload.kind === 'org_unit' && target.kind === 'business_unit' && target.placement === 'inside') {
    return {
      kind: 'assign_org_unit_business_unit',
      orgUnitId: payload.id,
      businessUnitId: target.id
    };
  }

  if (payload.kind === 'org_unit' && target.kind === 'scope_bucket' && target.placement === 'inside') {
    void (target.id as ScopeBucketId);
    return {
      kind: 'assign_org_unit_business_unit',
      orgUnitId: payload.id,
      businessUnitId: null
    };
  }

  return null;
}

export function useOrgChartPointerDnd(input: UseOrgChartPointerDndInput) {
  const { enabled, orgUnits, businessUnits, operators, onCommand } = input;
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const rowRefs = useRef<Map<string, RowEntry>>(new Map());
  const candidateRef = useRef<DragCandidate | null>(null);

  const setRowRef = useCallback((kind: ExtendedRowKind, id: string, element: HTMLButtonElement | null) => {
    const key = `${kind}:${id}`;
    if (!element) {
      rowRefs.current.delete(key);
      return;
    }

    rowRefs.current.set(key, { kind, id, element });
  }, []);

  const endDrag = useCallback(() => {
    candidateRef.current = null;
    setActiveDrag(null);
    setDropTarget(null);
    document.body.classList.remove('agent-chart-pointer-dragging');
  }, []);

  useEffect(() => {
    if (!enabled) {
      endDrag();
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate) {
        return;
      }

      if (candidate.pointerId !== event.pointerId) {
        return;
      }

      if (!activeDrag) {
        if (!movementExceededThreshold(candidate, event.clientX, event.clientY)) {
          return;
        }

        document.body.classList.add('agent-chart-pointer-dragging');
        setActiveDrag({
          pointerId: candidate.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          payload: candidate.payload
        });
      }

      setActiveDrag((current) =>
        current
          ? {
              ...current,
              clientX: event.clientX,
              clientY: event.clientY
            }
          : current
      );

      const rows = [...rowRefs.current.values()];
      const hit = resolveHitRow(rows, event.clientX, event.clientY);
      if (!hit) {
        setDropTarget(null);
        return;
      }

      const placement = resolvePlacement(candidate.payload, hit, event.clientY);
      const nextTarget: DropTarget = { kind: hit.kind, id: hit.id, placement };
      if (!isDropAllowed(candidate.payload, nextTarget)) {
        setDropTarget(null);
        return;
      }

      setDropTarget(nextTarget);
    };

    const onPointerUp = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate || candidate.pointerId !== event.pointerId) {
        return;
      }

      if (activeDrag && dropTarget) {
        const command = buildCommand(candidate.payload, dropTarget, orgUnits);
        if (command) {
          onCommand(command);
        }
      }

      endDrag();
    };

    const onPointerCancel = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate || candidate.pointerId !== event.pointerId) {
        return;
      }
      endDrag();
    };

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);

    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
    };
  }, [activeDrag, dropTarget, enabled, endDrag, onCommand, orgUnits]);

  const beginRowDragCandidate = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, payload: DragPayload) => {
      if (!enabled) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      candidateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        payload
      };
    },
    [enabled]
  );

  const dragSourceKey = activeDrag ? `${activeDrag.payload.kind}:${activeDrag.payload.id}` : null;

  const actorById = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators]);
  const orgUnitById = useMemo(() => new Map(orgUnits.map((unit) => [unit.id, unit])), [orgUnits]);
  const businessUnitById = useMemo(() => new Map(businessUnits.map((unit) => [unit.id, unit])), [businessUnits]);

  const payloadLabel = useMemo(() => {
    if (!activeDrag) {
      return '';
    }

    if (activeDrag.payload.kind === 'operator') {
      const operator = actorById.get(activeDrag.payload.id);
      if (!operator) {
        return 'Operator';
      }
      return operator.title ? `${operator.name} — ${operator.title}` : operator.name;
    }

    const unit = orgUnitById.get(activeDrag.payload.id);
    return unit?.name ?? 'Org Unit';
  }, [activeDrag, actorById, orgUnitById]);

  const dropActionText = useMemo(() => {
    if (!activeDrag) {
      return '';
    }

    if (!dropTarget) {
      return activeDrag.payload.kind === 'operator' ? 'Drag to reassign team or reports-to' : 'Drag to reparent or reorder org unit';
    }

    if (activeDrag.payload.kind === 'operator' && dropTarget.kind === 'org_unit' && dropTarget.placement === 'inside') {
      const unitName = orgUnitById.get(dropTarget.id)?.name ?? 'org unit';
      return `Re-assigning team to ${unitName}`;
    }

    if (activeDrag.payload.kind === 'operator' && dropTarget.kind === 'operator' && dropTarget.placement === 'inside') {
      const managerName = actorById.get(dropTarget.id)?.name ?? 'selected operator';
      return `Re-assigning reports-to ${managerName}`;
    }

    if (activeDrag.payload.kind === 'org_unit' && dropTarget.kind === 'org_unit') {
      const targetName = orgUnitById.get(dropTarget.id)?.name ?? 'selected org unit';
      if (dropTarget.placement === 'inside') {
        return `Moving under ${targetName}`;
      }
      if (dropTarget.placement === 'before') {
        return `Reordering before ${targetName}`;
      }
      return `Reordering after ${targetName}`;
    }

    if (activeDrag.payload.kind === 'org_unit' && dropTarget.kind === 'business_unit' && dropTarget.placement === 'inside') {
      const buName = businessUnitById.get(dropTarget.id)?.name ?? 'business unit';
      return `Assigning to ${buName}`;
    }

    if (activeDrag.payload.kind === 'org_unit' && dropTarget.kind === 'scope_bucket' && dropTarget.placement === 'inside') {
      return 'Assigning to Unassigned bucket';
    }

    return 'Drop target not available';
  }, [activeDrag, dropTarget, actorById, businessUnitById, orgUnitById]);

  const dragChipMeta = useMemo(() => {
    if (!activeDrag) {
      return null;
    }

    return {
      x: activeDrag.clientX,
      y: activeDrag.clientY,
      label: payloadLabel,
      category: dropActionText
    };
  }, [activeDrag, payloadLabel, dropActionText]);

  const getRowDragState = useCallback(
    (kind: ExtendedRowKind, id: string) => {
      const key = `${kind}:${id}`;
      const isSource = key === dragSourceKey;
      const isTarget = dropTarget?.kind === kind && dropTarget.id === id;
      const placement = isTarget ? dropTarget.placement : null;

      return {
        isSource,
        isTarget,
        placement
      };
    },
    [dragSourceKey, dropTarget]
  );

  const getDropActionLabel = useCallback(
    (kind: ExtendedRowKind, id: string): string | null => {
      if (!activeDrag || !dropTarget) {
        return null;
      }

      if (dropTarget.kind !== kind || dropTarget.id !== id) {
        return null;
      }

      if (activeDrag.payload.kind === 'operator' && kind === 'org_unit' && dropTarget.placement === 'inside') {
        return 'Re-assign team';
      }

      if (activeDrag.payload.kind === 'operator' && kind === 'operator' && dropTarget.placement === 'inside') {
        return 'Set reports-to';
      }

      if (activeDrag.payload.kind === 'org_unit' && kind === 'org_unit') {
        if (dropTarget.placement === 'inside') {
          return 'Move under';
        }
        if (dropTarget.placement === 'before') {
          return 'Insert before';
        }
        return 'Insert after';
      }

      if (activeDrag.payload.kind === 'org_unit' && kind === 'business_unit' && dropTarget.placement === 'inside') {
        return 'Assign BU';
      }

      if (activeDrag.payload.kind === 'org_unit' && kind === 'scope_bucket' && dropTarget.placement === 'inside') {
        return 'Set Unassigned';
      }

      return null;
    },
    [activeDrag, dropTarget]
  );

  return {
    activeDrag,
    dropTarget,
    dragChipMeta,
    setRowRef,
    beginRowDragCandidate,
    getRowDragState,
    getDropActionLabel
  };
}
