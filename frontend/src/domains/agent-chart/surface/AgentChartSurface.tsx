/**
 * Purpose: Render the org-chart hierarchy editor for org units and actors.
 * Responsibilities:
 * - Provide file-system-style tree editing with drag and drop.
 * - Route all mutations through command-backed shared org-chart store.
 */
// @tags: domain,agent-chart,surface,org-chart
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { type Actor, type OrgUnit, type OrgUnitScope, useOrgChartStore } from '../../../shared/config';
import {
  DropdownSelector,
  ConfirmDialogModal,
  LeftColumnShell,
  LeftColumnTopBar,
  NavTooltipPopover,
  TextButton,
  TextField,
  TopRailShell,
  type DropdownOption
} from '../../../shared/ui';
import { buildActorTree, buildOrgUnitTree, type ActorTreeNode, type OrgUnitTreeNode, useOrgChartPointerDnd } from '../model';
import { OrgChartDragChip } from './OrgChartDragChip';
import { AgentAvatarCropModal } from '../../../shared/modules/agent-manifest';
import './AgentChartSurface.css';

type SelectedNode =
  | { kind: 'business_unit'; id: string }
  | { kind: 'scope_bucket'; scope: Exclude<OrgUnitScope, 'business_unit'> }
  | { kind: 'org_unit'; id: string }
  | { kind: 'actor'; id: string }
  | null;

type BusinessUnitTreeNode = {
  id: string;
  name: string;
  children: BusinessUnitTreeNode[];
};

const ORG_SCOPE_LABELS: Record<OrgUnitScope, string> = {
  business_unit: 'Business Unit',
  shared: 'Shared',
  unassigned: 'Unassigned'
};

type PendingDelete =
  | { kind: 'business_unit'; id: string; label: string }
  | { kind: 'org_unit'; id: string; label: string }
  | { kind: 'actor'; id: string; label: string }
  | null;

type PendingMediaTarget =
  | { kind: 'business_unit'; id: string }
  | { kind: 'org_unit'; id: string }
  | { kind: 'actor'; id: string }
  | null;

function findTopLevelOrgUnit(units: OrgUnit[], orgUnitId: string): OrgUnit | undefined {
  let cursor = units.find((unit) => unit.id === orgUnitId);
  while (cursor?.parentOrgUnitId) {
    cursor = units.find((unit) => unit.id === cursor?.parentOrgUnitId);
  }
  return cursor;
}

function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`agent-chart-collapse-icon${collapsed ? ' is-collapsed' : ' is-open'}`}>
      <g className="agent-chart-collapse-icon-hamburger">
        <line x1="5.2" y1="6.2" x2="14.8" y2="6.2" />
        <line x1="5.2" y1="10" x2="14.8" y2="10" />
        <line x1="5.2" y1="13.8" x2="14.8" y2="13.8" />
      </g>
      <path className="agent-chart-collapse-icon-chevron" d="m5.4 7.2 4.6 6 4.6-6" />
    </svg>
  );
}

function NodeMediaIcon({
  kind,
  actorKind
}: {
  kind: 'business_unit' | 'org_unit' | 'shared_bucket' | 'unassigned_bucket' | 'actor';
  actorKind?: Actor['kind'];
}) {
  if (kind === 'business_unit') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.2" y="3.6" width="13.6" height="12.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.2 7.4h7.6M6.2 10h7.6M6.2 12.6h5.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'org_unit') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3.6" y="4.2" width="12.8" height="11.6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.3 8h7.4M6.3 10.6h7.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'shared_bucket') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="6.2" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13.8" cy="6.2" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13.8" cy="13.8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8.2 9.2 11.7 7.2M8.2 10.8l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'unassigned_bucket') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="m7.7 7.7 4.6 4.6m0-4.6-4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (actorKind === 'human') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="7" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.2 15c.7-2.2 2.4-3.5 4.8-3.5s4.1 1.3 4.8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4.1" width="12" height="11.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8.1h6m-6 2.9h4.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function NodeMedia({
  image,
  className,
  fallback
}: {
  image: string | undefined;
  className?: string;
  fallback: ReactNode;
}) {
  return (
    <span className={`agent-chart-node-media${className ? ` ${className}` : ''}`} aria-hidden="true">
      {image ? <img src={image} alt="" /> : fallback}
    </span>
  );
}

export function AgentChartSurface() {
  const { businessUnits, orgUnits, actors, execute, canUndo, canRedo, undo, redo, getOrgUnitById, getActorById } =
    useOrgChartStore();

  const [hierarchyMode, setHierarchyMode] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'list' | 'canvas'>('list');
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingMediaTarget, setPendingMediaTarget] = useState<PendingMediaTarget>(null);
  const [pendingMediaSource, setPendingMediaSource] = useState<string | null>(null);
  const [collapsedBusinessUnitIds, setCollapsedBusinessUnitIds] = useState<Set<string>>(() => new Set());
  const [collapsedOrgUnitIds, setCollapsedOrgUnitIds] = useState<Set<string>>(() => new Set());
  const [collapsedActorIds, setCollapsedActorIds] = useState<Set<string>>(() => new Set());
  const [collapsedScopeBuckets, setCollapsedScopeBuckets] = useState<Set<'shared' | 'unassigned'>>(() => new Set());

  const [orgNameDraft, setOrgNameDraft] = useState('');
  const [businessUnitNameDraft, setBusinessUnitNameDraft] = useState('');
  const [actorNameDraft, setActorNameDraft] = useState('');
  const [actorTitleDraft, setActorTitleDraft] = useState('');
  const lastSelectionKeyRef = useRef<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBusinessUnit =
    selectedNode?.kind === 'business_unit' ? businessUnits.find((unit) => unit.id === selectedNode.id) : undefined;
  const selectedOrg = selectedNode?.kind === 'org_unit' ? getOrgUnitById(selectedNode.id) : undefined;
  const selectedActor = selectedNode?.kind === 'actor' ? getActorById(selectedNode.id) : undefined;
  const selectedOrgTopLevel = useMemo(
    () => (selectedOrg ? findTopLevelOrgUnit(orgUnits, selectedOrg.id) : undefined),
    [orgUnits, selectedOrg]
  );
  const selectedOrgIsTopLevel = selectedOrg != null && selectedOrg.parentOrgUnitId == null;
  const selectedOrgEffectiveBusinessUnitId = selectedOrgTopLevel?.businessUnitId ?? selectedOrg?.businessUnitId ?? null;
  const selectedOrgEffectiveBusinessUnitName =
    selectedOrgEffectiveBusinessUnitId != null
      ? businessUnits.find((unit) => unit.id === selectedOrgEffectiveBusinessUnitId)?.name ?? null
      : null;
  const selectedOrgEffectiveScope: OrgUnitScope = selectedOrgTopLevel?.scope ?? selectedOrg?.scope ?? 'unassigned';
  const selectedOrgChildren = useMemo(
    () => (selectedOrg ? orgUnits.filter((unit) => unit.parentOrgUnitId === selectedOrg.id) : []),
    [orgUnits, selectedOrg]
  );

  const orgTree = useMemo(() => buildOrgUnitTree(orgUnits), [orgUnits]);
  const orgOptions = useMemo<DropdownOption[]>(
    () => orgUnits.map((unit) => ({ value: unit.id, label: unit.name })),
    [orgUnits]
  );
  const businessUnitOptions = useMemo<DropdownOption[]>(
    () => [{ value: '', label: 'Unassigned' }, ...businessUnits.map((unit) => ({ value: unit.id, label: unit.name }))],
    [businessUnits]
  );
  const orgScopeOptions: DropdownOption[] = [
    { value: 'business_unit', label: ORG_SCOPE_LABELS.business_unit },
    { value: 'shared', label: ORG_SCOPE_LABELS.shared },
    { value: 'unassigned', label: ORG_SCOPE_LABELS.unassigned }
  ];
  const orgParentOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedOrg) {
      return [{ value: '', label: 'No parent (top-level)' }];
    }

    return [
      { value: '', label: 'No parent (top-level)' },
      ...orgUnits.filter((unit) => unit.id !== selectedOrg.id).map((unit) => ({ value: unit.id, label: unit.name }))
    ];
  }, [orgUnits, selectedOrg]);
  const businessUnitParentOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedBusinessUnit) {
      return [{ value: '', label: 'No parent' }];
    }
    return [
      { value: '', label: 'No parent' },
      ...businessUnits
        .filter((unit) => unit.id !== selectedBusinessUnit.id)
        .map((unit) => ({ value: unit.id, label: unit.name }))
    ];
  }, [businessUnits, selectedBusinessUnit]);

  const managerOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedActor) {
      return [{ value: '', label: 'No manager' }];
    }

    return [
      { value: '', label: 'No manager' },
      ...actors
        .filter((actor) => actor.id !== selectedActor.id)
        .map((actor) => ({ value: actor.id, label: `${actor.name} (${actor.title})` }))
    ];
  }, [actors, selectedActor]);

  useEffect(() => {
    const selectionKey = selectedNode
      ? selectedNode.kind === 'scope_bucket'
        ? `${selectedNode.kind}:${selectedNode.scope}`
        : `${selectedNode.kind}:${selectedNode.id}`
      : null;
    if (selectionKey === lastSelectionKeyRef.current) {
      return;
    }
    lastSelectionKeyRef.current = selectionKey;

    if (selectedBusinessUnit) {
      setBusinessUnitNameDraft(selectedBusinessUnit.name);
      setOrgNameDraft('');
      setActorNameDraft('');
      setActorTitleDraft('');
      return;
    }

    if (selectedOrg) {
      setOrgNameDraft(selectedOrg.name);
      setBusinessUnitNameDraft('');
      setActorNameDraft('');
      setActorTitleDraft('');
      return;
    }

    if (selectedActor) {
      setActorNameDraft(selectedActor.name);
      setActorTitleDraft(selectedActor.title);
      setBusinessUnitNameDraft('');
      setOrgNameDraft('');
      return;
    }

    setBusinessUnitNameDraft('');
    setOrgNameDraft('');
    setActorNameDraft('');
    setActorTitleDraft('');
  }, [selectedNode, selectedBusinessUnit, selectedOrg, selectedActor]);

  const applyCommand = (run: () => { ok: boolean; message?: string }) => {
    const result = run();
    if (!result.ok) {
      setErrorMessage(result.message ?? 'Unable to apply org change.');
      return;
    }

    setErrorMessage('');
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.kind === 'business_unit') {
      applyCommand(() => execute({ kind: 'delete_business_unit', nodeId: pendingDelete.id }));
    } else if (pendingDelete.kind === 'org_unit') {
      applyCommand(() => execute({ kind: 'delete_org_unit', nodeId: pendingDelete.id }));
    } else if (pendingDelete.kind === 'actor') {
      applyCommand(() => execute({ kind: 'delete_actor', actorId: pendingDelete.id }));
    }

    setPendingDelete(null);
    setSelectedNode(null);
  };

  const openMediaEditor = (target: PendingMediaTarget, sourceDataUrl: string, croppedDataUrl: string) => {
    if (!target) {
      return;
    }
    setPendingMediaTarget(target);
    const existingSource = sourceDataUrl || croppedDataUrl;
    if (existingSource) {
      setPendingMediaSource(existingSource);
      setCropOpen(true);
      return;
    }
    setPendingMediaSource(null);
    mediaInputRef.current?.click();
  };

  const handleMediaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingMediaTarget) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === 'string' ? reader.result : '';
      if (!nextValue) {
        return;
      }
      setPendingMediaSource(nextValue);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleMediaCropConfirm = (croppedDataUrl: string) => {
    if (!pendingMediaTarget) {
      setCropOpen(false);
      setPendingMediaSource(null);
      return;
    }
    const sourceDataUrl = pendingMediaSource || croppedDataUrl;
    if (pendingMediaTarget.kind === 'business_unit') {
      applyCommand(() =>
        execute({
          kind: 'set_business_unit_logo',
          nodeId: pendingMediaTarget.id,
          sourceDataUrl,
          croppedDataUrl
        })
      );
    } else if (pendingMediaTarget.kind === 'org_unit') {
      applyCommand(() =>
        execute({
          kind: 'set_org_unit_icon',
          nodeId: pendingMediaTarget.id,
          sourceDataUrl,
          croppedDataUrl
        })
      );
    } else if (pendingMediaTarget.kind === 'actor') {
      applyCommand(() =>
        execute({
          kind: 'set_actor_avatar',
          actorId: pendingMediaTarget.id,
          sourceDataUrl,
          croppedDataUrl
        })
      );
    }
    setCropOpen(false);
    setPendingMediaSource(null);
    setPendingMediaTarget(null);
  };

  const addOrgUnit = () => {
    const parentId = selectedNode?.kind === 'org_unit' ? selectedNode.id : null;
    if (parentId) {
      applyCommand(() => execute({ kind: 'create_org_unit', parentId, payload: { name: 'New Org Unit' } }));
      return;
    }

    if (selectedNode?.kind === 'business_unit') {
      applyCommand(() =>
        execute({
          kind: 'create_org_unit',
          parentId: null,
          payload: { name: 'New Org Unit', rootScope: 'business_unit', rootBusinessUnitId: selectedNode.id }
        })
      );
      return;
    }

    if (selectedNode?.kind === 'scope_bucket') {
      applyCommand(() =>
        execute({ kind: 'create_org_unit', parentId: null, payload: { name: 'New Org Unit', rootScope: selectedNode.scope } })
      );
      return;
    }

    applyCommand(() => execute({ kind: 'create_org_unit', parentId: null, payload: { name: 'New Org Unit', rootScope: 'unassigned' } }));
  };

  const addBusinessUnit = () => {
    applyCommand(() => execute({ kind: 'create_business_unit', parentId: null, payload: { name: 'New Business Unit' } }));
  };

  const addActor = () => {
    const firstOrgUnit = orgUnits[0];
    const targetOrgUnitId =
      selectedNode?.kind === 'org_unit'
        ? selectedNode.id
        : selectedNode?.kind === 'actor'
          ? getActorById(selectedNode.id)?.orgUnitId
          : firstOrgUnit?.id;

    if (!targetOrgUnitId) {
      setErrorMessage('Create an org unit before adding an actor.');
      return;
    }

    applyCommand(() =>
      execute({
        kind: 'create_actor',
        targetOrgUnitId,
        payload: { name: 'New Actor', title: 'Role', kind: 'agent' }
      })
    );
  };

  const toggleCollapsedId = (id: string, setCollapsed: Dispatch<SetStateAction<Set<string>>>) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCollapsedScopeBucket = (scope: 'shared' | 'unassigned') => {
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

  const dnd = useOrgChartPointerDnd({
    enabled: hierarchyMode,
    orgUnits,
    businessUnits,
    actors,
    onCommand: (command) => applyCommand(() => execute(command))
  });

  const reportCountByManager = useMemo(() => {
    const map = new Map<string, number>();
    actors.forEach((actor) => {
      if (!actor.managerActorId) {
        return;
      }
      map.set(actor.managerActorId, (map.get(actor.managerActorId) ?? 0) + 1);
    });
    return map;
  }, [actors]);

  const businessUnitTree = useMemo<BusinessUnitTreeNode[]>(() => {
    const byParent = new Map<string | null, typeof businessUnits>();
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

  const renderTreeGuides = (depth: number) => (
    <span className="agent-chart-tree-guides" style={{ width: `${depth * 18}px` }} aria-hidden="true">
      {Array.from({ length: depth }).map((_, index) => (
        <span
          key={`guide-${depth}-${index}`}
          className="agent-chart-tree-guide-line"
          style={{ left: `${index * 18 + 8}px` }}
        />
      ))}
      {depth > 0 ? (
        <span className="agent-chart-tree-guide-elbow" style={{ left: `${(depth - 1) * 18 + 8}px` }} />
      ) : null}
    </span>
  );

  const renderActorNode = (node: ActorTreeNode, depth: number) => {
    const actor = node.actor;
    const selected = selectedNode?.kind === 'actor' && selectedNode.id === actor.id;
    const reportsCount = reportCountByManager.get(actor.id) ?? 0;
    const hasChildren = node.children.length > 0;
    const collapsed = collapsedActorIds.has(actor.id);
    const dragState = dnd.getRowDragState('actor', actor.id);
    const dropActionLabel = dnd.getDropActionLabel('actor', actor.id);

    return (
      <div key={actor.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-tree-row actor${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}${dragState.isSource ? ' drag-source-hidden' : ''}`}
          onClick={() => setSelectedNode({ kind: 'actor', id: actor.id })}
          ref={(nodeRef) => dnd.setRowRef('actor', actor.id, nodeRef)}
          onPointerDown={(event) => dnd.beginRowDragCandidate(event, { kind: 'actor', id: actor.id })}
        >
          {renderTreeGuides(depth)}
          <span className="agent-chart-row-card">
            <NodeMedia image={actor.avatarDataUrl} fallback={<NodeMediaIcon kind="actor" actorKind={actor.kind} />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{actor.name}</span>
              <span className="agent-chart-node-meta">
                {actor.title}
                {reportsCount > 0 ? ` · ${reportsCount} report${reportsCount === 1 ? '' : 's'}` : ''}
              </span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(actor.id, setCollapsedActorIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? node.children.map((child) => renderActorNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderOrgNode = (node: OrgUnitTreeNode, depth = 0) => {
    const selected = selectedNode?.kind === 'org_unit' && selectedNode.id === node.unit.id;
    const actorTree = buildActorTree(actors, node.unit.id);
    const hasChildren = actorTree.length > 0 || node.children.length > 0;
    const collapsed = collapsedOrgUnitIds.has(node.unit.id);
    const dragState = dnd.getRowDragState('org_unit', node.unit.id);
    const dropActionLabel = dnd.getDropActionLabel('org_unit', node.unit.id);
    const beforeClass = dragState.isTarget && dragState.placement === 'before' ? ' drop-before' : '';
    const afterClass = dragState.isTarget && dragState.placement === 'after' ? ' drop-after' : '';
    const insideClass = dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : '';
    const sourceClass = dragState.isSource ? ' drag-source-hidden' : '';

    return (
      <div key={node.unit.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-tree-row org${selected ? ' active' : ''}${beforeClass}${afterClass}${insideClass}${sourceClass}`}
          onClick={() => setSelectedNode({ kind: 'org_unit', id: node.unit.id })}
          ref={(nodeRef) => dnd.setRowRef('org_unit', node.unit.id, nodeRef)}
          onPointerDown={(event) => dnd.beginRowDragCandidate(event, { kind: 'org_unit', id: node.unit.id })}
        >
          {renderTreeGuides(depth)}
          <span className="agent-chart-row-card">
            <NodeMedia image={node.unit.iconDataUrl} fallback={<NodeMediaIcon kind="org_unit" />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{node.unit.name}</span>
              <span className="agent-chart-node-meta">Org Unit</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(node.unit.id, setCollapsedOrgUnitIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>

        {!collapsed ? actorTree.map((actorNode) => renderActorNode(actorNode, depth + 1)) : null}
        {!collapsed ? node.children.map((child) => renderOrgNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderBusinessUnitNode = (node: BusinessUnitTreeNode, depth = 0) => {
    const assignedCount = orgUnits.filter((unit) => unit.scope === 'business_unit' && unit.businessUnitId === node.id).length;
    const selected = selectedNode?.kind === 'business_unit' && selectedNode.id === node.id;
    const attachedOrgRoots = orgRootsByBusinessUnit.get(node.id) ?? [];
    const hasChildren = attachedOrgRoots.length > 0 || node.children.length > 0;
    const collapsed = collapsedBusinessUnitIds.has(node.id);
    const dragState = dnd.getRowDragState('business_unit', node.id);
    const dropActionLabel = dnd.getDropActionLabel('business_unit', node.id);
    return (
      <div key={node.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-business-unit-row${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}`}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          onClick={() => setSelectedNode({ kind: 'business_unit', id: node.id })}
          ref={(nodeRef) => dnd.setRowRef('business_unit', node.id, nodeRef)}
        >
          <span className="agent-chart-row-card">
            <NodeMedia image={businessUnits.find((entry) => entry.id === node.id)?.logoDataUrl} className="business-unit" fallback={<NodeMediaIcon kind="business_unit" />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{node.name}</span>
              <span className="agent-chart-node-meta">{assignedCount} org unit{assignedCount === 1 ? '' : 's'}</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(node.id, setCollapsedBusinessUnitIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? attachedOrgRoots.map((rootNode) => renderOrgNode(rootNode, depth + 1)) : null}
        {!collapsed ? node.children.map((child) => renderBusinessUnitNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderScopeBucketNode = (scope: 'shared' | 'unassigned', title: string, roots: OrgUnitTreeNode[]) => {
    const selected = selectedNode?.kind === 'scope_bucket' && selectedNode.scope === scope;
    const hasChildren = roots.length > 0;
    const collapsed = collapsedScopeBuckets.has(scope);
    const dragState = dnd.getRowDragState('scope_bucket', scope);
    const dropActionLabel = dnd.getDropActionLabel('scope_bucket', scope);
    return (
      <div key={scope} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-business-unit-row${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}`}
          style={{ paddingLeft: '12px' }}
          onClick={() => setSelectedNode({ kind: 'scope_bucket', scope })}
          ref={(nodeRef) => dnd.setRowRef('scope_bucket', scope, nodeRef)}
        >
          <span className="agent-chart-row-card">
            <NodeMedia
              image={undefined}
              className="business-unit scope-bucket"
              fallback={<NodeMediaIcon kind={scope === 'shared' ? 'shared_bucket' : 'unassigned_bucket'} />}
            />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{title}</span>
              <span className="agent-chart-node-meta">{roots.length} top-level org unit{roots.length === 1 ? '' : 's'}</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedScopeBucket(scope);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? roots.map((rootNode) => renderOrgNode(rootNode, 1)) : null}
      </div>
    );
  };

  const leftPane = (
    <section className="agent-chart-left-pane" aria-label="Org hierarchy">
      <LeftColumnTopBar
        tone="raised"
        left={
          <div className="agent-chart-icon-actions">
            <button type="button" className="agent-chart-icon-button nav-tooltip-host" onClick={addOrgUnit} aria-label="Add org unit">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3.5" y="3.5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M14.5 10v4.5M12.25 12.25h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Org Unit" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={addBusinessUnit}
              aria-label="Add business unit"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="4.8" width="6.2" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <rect x="10.6" y="3.6" width="6.2" height="12" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M13.7 6.8v4.2M11.6 8.9h4.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Business Unit" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button type="button" className="agent-chart-icon-button nav-tooltip-host" onClick={addActor} aria-label="Add actor">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8" cy="7" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3.9 14.8c.6-2 2-3.1 4.1-3.1s3.5 1.1 4.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M14.8 10.4v4.4M12.6 12.6H17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Actor" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button
              type="button"
              className={`agent-chart-icon-button nav-tooltip-host${hierarchyMode ? ' active' : ''}`}
              onClick={() => setHierarchyMode((current) => !current)}
              aria-label="Toggle hierarchy edit mode"
              aria-pressed={hierarchyMode}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M6.5 4.2v11.6M6.5 4.2 4.2 6.5M6.5 4.2l2.3 2.3M13.5 15.8V4.2M13.5 15.8l-2.3-2.3M13.5 15.8l2.3-2.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Re-Org Mode" orientation="horizontal" side="bottom" align="start" />
            </button>
          </div>
        }
        right={
          <div className="agent-chart-history-actions">
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7.8 6.2 4.2 9.8l3.6 3.6M5 9.8h6.4a4.2 4.2 0 1 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Undo" orientation="horizontal" side="bottom" align="end" />
            </button>
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12.2 6.2 3.6 3.6-3.6 3.6M15 9.8H8.6a4.2 4.2 0 1 0 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Redo" orientation="horizontal" side="bottom" align="end" />
            </button>
          </div>
        }
      />

      {errorMessage ? <p className="agent-chart-error-banner">{errorMessage}</p> : null}

      <div className="agent-chart-tree" role="tree">
        <div className="agent-chart-tree-section-heading">Organization</div>
        {businessUnitTree.length === 0 ? (
          <div className="agent-chart-tree-section-empty">No business units yet.</div>
        ) : (
          businessUnitTree.map((node) => renderBusinessUnitNode(node))
        )}
        {renderScopeBucketNode('shared', 'Shared', sharedOrgRoots)}
        {unassignedOrgRoots.length > 0 ? renderScopeBucketNode('unassigned', 'Unassigned', unassignedOrgRoots) : null}
      </div>
    </section>
  );

  const actorTypeOptions: DropdownOption[] = [
    { value: 'agent', label: 'Agent' },
    { value: 'human', label: 'Human' }
  ];

  const rightPane = (
    <section className="agent-chart-right-pane" aria-label="Org item details">
      <TopRailShell
        tone="raised"
        left={
          <div className="agent-chart-workspace-meta">
            <span className="agent-chart-workspace-title">Org Workspace</span>
            <span className="agent-chart-workspace-status">
              {workspaceView === 'list' ? 'List View' : 'Canvas View'} · {hierarchyMode ? 'Hierarchy Edit On' : 'Hierarchy Edit Off'}
            </span>
          </div>
        }
        right={
          <div className="agent-chart-view-toggle">
            <button
              type="button"
              className={`agent-chart-view-toggle-button${workspaceView === 'list' ? ' active' : ''}`}
              onClick={() => setWorkspaceView('list')}
              aria-pressed={workspaceView === 'list'}
            >
              List
            </button>
            <button
              type="button"
              className={`agent-chart-view-toggle-button${workspaceView === 'canvas' ? ' active' : ''}`}
              onClick={() => setWorkspaceView('canvas')}
              aria-pressed={workspaceView === 'canvas'}
            >
              Canvas
            </button>
          </div>
        }
      />

      {workspaceView === 'list' && selectedBusinessUnit ? (
        <div className="agent-chart-details-card">
          <h2>Business Unit</h2>
          <button
            type="button"
            className="agent-chart-media-picker"
            onClick={() =>
              openMediaEditor(
                { kind: 'business_unit', id: selectedBusinessUnit.id },
                selectedBusinessUnit.logoSourceDataUrl,
                selectedBusinessUnit.logoDataUrl
              )
            }
          >
            <NodeMedia
              image={selectedBusinessUnit.logoDataUrl}
              className="business-unit details"
              fallback={<NodeMediaIcon kind="business_unit" />}
            />
            <span>{selectedBusinessUnit.logoDataUrl ? 'Edit Logo' : 'Select Logo'}</span>
          </button>
          <label className="agent-chart-field-label" htmlFor="business-unit-name">
            Name
          </label>
          <TextField
            value={businessUnitNameDraft}
            onValueChange={setBusinessUnitNameDraft}
            ariaLabel="Business unit name"
            placeholder="Business unit name"
          />
          <label className="agent-chart-field-label" htmlFor="business-unit-parent">
            Parent Business Unit
          </label>
          <DropdownSelector
            value={selectedBusinessUnit.parentBusinessUnitId ?? ''}
            options={businessUnitParentOptions}
            onValueChange={(value) =>
              applyCommand(() =>
                execute({
                  kind: 'move_business_unit',
                  nodeId: selectedBusinessUnit.id,
                  newParentId: value || null
                })
              )
            }
            ariaLabel="Business unit parent"
          />
          <div className="agent-chart-details-actions">
            <TextButton
              label="Delete"
              variant="danger"
              onClick={() =>
                setPendingDelete({
                  kind: 'business_unit',
                  id: selectedBusinessUnit.id,
                  label: selectedBusinessUnit.name
                })
              }
            />
            <TextButton
              label="Save"
              variant="primary"
              onClick={() =>
                applyCommand(() =>
                  execute({ kind: 'rename_business_unit', nodeId: selectedBusinessUnit.id, name: businessUnitNameDraft })
                )
              }
            />
          </div>
        </div>
      ) : null}

      {workspaceView === 'list' && selectedOrg ? (
        <div className="agent-chart-details-card">
          <h2>Org Unit</h2>
          <button
            type="button"
            className="agent-chart-media-picker"
            onClick={() =>
              openMediaEditor(
                { kind: 'org_unit', id: selectedOrg.id },
                selectedOrg.iconSourceDataUrl,
                selectedOrg.iconDataUrl
              )
            }
          >
            <NodeMedia image={selectedOrg.iconDataUrl} className="details" fallback={<NodeMediaIcon kind="org_unit" />} />
            <span>{selectedOrg.iconDataUrl ? 'Edit Icon' : 'Select Icon'}</span>
          </button>
          <label className="agent-chart-field-label" htmlFor="org-unit-name">
            Name
          </label>
          <TextField
            value={orgNameDraft}
            onValueChange={setOrgNameDraft}
            ariaLabel="Org unit name"
            placeholder="Org unit name"
          />
          <label className="agent-chart-field-label" htmlFor="org-unit-parent">
            Parent Org Unit
          </label>
          <DropdownSelector
            value={selectedOrg.parentOrgUnitId ?? ''}
            options={orgParentOptions}
            onValueChange={(value) =>
              applyCommand(() =>
                execute({
                  kind: 'move_org_unit',
                  nodeId: selectedOrg.id,
                  newParentId: value || null
                })
              )
            }
            ariaLabel="Org unit parent"
          />
          <div className="agent-chart-child-org-list">
            <span className="agent-chart-field-label">Direct Child Org Units</span>
            {selectedOrgChildren.length === 0 ? (
              <p className="agent-chart-field-hint">No child org units.</p>
            ) : (
              <ul className="agent-chart-child-org-items">
                {selectedOrgChildren.map((unit) => (
                  <li key={unit.id}>{unit.name}</li>
                ))}
              </ul>
            )}
          </div>
          <label className="agent-chart-field-label" htmlFor="org-unit-scope">
            Scope
          </label>
          <DropdownSelector
            value={selectedOrgEffectiveScope}
            options={orgScopeOptions}
            disabled={!selectedOrgIsTopLevel}
            onValueChange={(value) =>
              applyCommand(() =>
                execute({
                  kind: 'set_org_unit_scope',
                  orgUnitId: selectedOrg.id,
                  scope: value as OrgUnitScope,
                  businessUnitId:
                    (value as OrgUnitScope) === 'business_unit' ? (selectedOrgEffectiveBusinessUnitId ?? businessUnits[0]?.id ?? null) : null
                })
              )
            }
            ariaLabel="Org unit scope"
          />
          {!selectedOrgIsTopLevel ? (
            <p className="agent-chart-field-hint">
              Inherited from top-level org unit: {selectedOrgTopLevel?.name ?? 'Unknown'} ({ORG_SCOPE_LABELS[selectedOrgEffectiveScope]}).
            </p>
          ) : null}
          <label className="agent-chart-field-label" htmlFor="org-unit-business-unit">
            Business Unit
          </label>
          <DropdownSelector
            value={selectedOrgEffectiveBusinessUnitId ?? ''}
            options={businessUnitOptions}
            disabled={!selectedOrgIsTopLevel || selectedOrgEffectiveScope !== 'business_unit'}
            onValueChange={(value) =>
              applyCommand(() =>
                execute({
                  kind: 'assign_org_unit_business_unit',
                  orgUnitId: selectedOrg.id,
                  businessUnitId: value || null
                })
              )
            }
            ariaLabel="Org unit business unit"
          />
          {!selectedOrgIsTopLevel && selectedOrgEffectiveScope === 'business_unit' ? (
            <p className="agent-chart-field-hint">
              Inherited from top-level org unit: {selectedOrgTopLevel?.name ?? 'Unknown'} (
              {selectedOrgEffectiveBusinessUnitName ?? 'Unassigned'}).
            </p>
          ) : null}
          <div className="agent-chart-details-actions">
            <TextButton
              label="Delete"
              variant="danger"
              onClick={() =>
                setPendingDelete({
                  kind: 'org_unit',
                  id: selectedOrg.id,
                  label: selectedOrg.name
                })
              }
            />
            <TextButton
              label="Save"
              variant="primary"
              onClick={() =>
                applyCommand(() => execute({ kind: 'rename_org_unit', nodeId: selectedOrg.id, name: orgNameDraft }))
              }
            />
          </div>
        </div>
      ) : null}

      {workspaceView === 'list' && selectedActor ? (
        <div className="agent-chart-details-card">
          <h2>Actor</h2>
          <button
            type="button"
            className="agent-chart-media-picker"
            onClick={() =>
              openMediaEditor(
                { kind: 'actor', id: selectedActor.id },
                selectedActor.avatarSourceDataUrl,
                selectedActor.avatarDataUrl
              )
            }
          >
            <NodeMedia
              image={selectedActor.avatarDataUrl}
              className="actor details"
              fallback={<NodeMediaIcon kind="actor" actorKind={selectedActor.kind} />}
            />
            <span>{selectedActor.avatarDataUrl ? 'Edit Profile Image' : 'Select Profile Image'}</span>
          </button>

          <label className="agent-chart-field-label" htmlFor="actor-name">
            Name
          </label>
          <TextField value={actorNameDraft} onValueChange={setActorNameDraft} ariaLabel="Actor name" placeholder="Name" />

          <label className="agent-chart-field-label" htmlFor="actor-title">
            Title
          </label>
          <TextField
            value={actorTitleDraft}
            onValueChange={setActorTitleDraft}
            ariaLabel="Actor title"
            placeholder="Title"
          />

          <label className="agent-chart-field-label" htmlFor="actor-kind">
            Type
          </label>
          <DropdownSelector
            value={selectedActor.kind}
            options={actorTypeOptions}
            onValueChange={(value) =>
              applyCommand(() => execute({ kind: 'update_actor', actorId: selectedActor.id, patch: { kind: value as Actor['kind'] } }))
            }
            ariaLabel="Actor type"
          />

          <label className="agent-chart-field-label" htmlFor="actor-org-unit">
            Org Unit
          </label>
          <DropdownSelector
            value={selectedActor.orgUnitId}
            options={orgOptions}
            onValueChange={(value) =>
              applyCommand(() => execute({ kind: 'move_actor', actorId: selectedActor.id, targetOrgUnitId: value }))
            }
            ariaLabel="Actor org unit"
          />

          <label className="agent-chart-field-label" htmlFor="actor-manager">
            Reports To
          </label>
          <DropdownSelector
            value={selectedActor.managerActorId ?? ''}
            options={managerOptions}
            onValueChange={(value) =>
              applyCommand(() =>
                execute({ kind: 'set_actor_manager', actorId: selectedActor.id, managerActorId: value || null })
              )
            }
            ariaLabel="Actor manager"
          />

          <div className="agent-chart-details-actions">
            <TextButton
              label="Delete"
              variant="danger"
              onClick={() =>
                setPendingDelete({
                  kind: 'actor',
                  id: selectedActor.id,
                  label: selectedActor.name
                })
              }
            />
            <TextButton
              label="Save"
              variant="primary"
              onClick={() =>
                applyCommand(() =>
                  execute({
                    kind: 'update_actor',
                    actorId: selectedActor.id,
                    patch: { name: actorNameDraft, title: actorTitleDraft }
                  })
                )
              }
            />
          </div>
        </div>
      ) : null}

      {workspaceView === 'list' && !selectedActor && !selectedOrg && !selectedBusinessUnit ? (
        <div className="agent-chart-empty-details">
          <h2>Org Chart</h2>
          <p>Select an org unit or actor from the tree to edit details.</p>
        </div>
      ) : null}

      {workspaceView === 'canvas' ? (
        <div className="agent-chart-canvas-placeholder">
          <h2>Org Canvas</h2>
          <p>Infinity canvas org graph view will be added next.</p>
        </div>
      ) : null}
    </section>
  );

  return (
    <section className="agent-chart-surface">
      <LeftColumnShell left={leftPane} right={rightPane} width="wide" />
      <OrgChartDragChip chip={dnd.dragChipMeta} />
      <AgentAvatarCropModal
        open={cropOpen}
        sourceDataUrl={pendingMediaSource}
        onCancel={() => {
          setCropOpen(false);
          setPendingMediaSource(null);
          setPendingMediaTarget(null);
        }}
        onReplaceImage={() => {
          setCropOpen(false);
          setPendingMediaSource(null);
          window.setTimeout(() => {
            mediaInputRef.current?.click();
          }, 0);
        }}
        onConfirm={handleMediaCropConfirm}
      />
      <ConfirmDialogModal
        open={pendingDelete != null}
        title={`Delete ${pendingDelete?.kind === 'business_unit' ? 'Business Unit' : pendingDelete?.kind === 'org_unit' ? 'Org Unit' : 'Actor'}?`}
        message={`This action cannot be undone. ${pendingDelete?.label ?? 'Selected item'} will be removed.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
      <input ref={mediaInputRef} type="file" accept="image/*" className="agent-chart-media-input" onChange={handleMediaFileChange} />
    </section>
  );
}
