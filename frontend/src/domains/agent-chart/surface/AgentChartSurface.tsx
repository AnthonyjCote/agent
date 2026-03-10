/**
 * Purpose: Render the org-chart hierarchy editor for org units and operators.
 * Responsibilities:
 * - Provide file-system-style tree editing with drag and drop.
 * - Route all mutations through command-backed shared org-chart store.
 */
// @tags: domain,agent-chart,surface,org-chart
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import { useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultAgentManifestInput, useAgentManifestStore, useOrgChartStore } from '../../../shared/config';
import { ConfirmDialogModal, LeftColumnShell } from '../../../shared/ui';
import { buildOperatorTree, useOrgChartPointerDnd } from '../model';
import { OrgChartDragChip } from './OrgChartDragChip';
import { AgentAvatarCropModal, OrgEntityCreateModal } from '../../../shared/modules';
import {
  OrgChartLeftPane,
  OrgChartRightPane
} from './components';
import {
  useOrgChartCollapseState,
  useOrgChartMediaEditor,
  useOrgChartSelectionState,
  useOrgChartSurfaceActions,
  useOrgChartTreeProjection
} from './hooks';
import type { SelectedNode } from './types';
import './AgentChartSurface.css';

type TreeNodeKey = `business_unit:${string}` | `org_unit:${string}` | `operator:${string}` | `scope_bucket:unassigned`;

function keyForSelectedNode(node: NonNullable<SelectedNode>): TreeNodeKey {
  if (node.kind === 'scope_bucket') {
    return `scope_bucket:${node.scope}`;
  }
  return `${node.kind}:${node.id}`;
}

export function AgentChartSurface() {
  const { businessUnits, orgUnits, operators, execute, canUndo, canRedo, undo, redo, getOrgUnitById, getOperatorById } =
    useOrgChartStore();
  const { agents, createAgent, updateAgent, deleteAgent } = useAgentManifestStore();
  const [createEntityKind, setCreateEntityKind] = useState<'business_unit' | 'org_unit' | 'operator' | null>(null);
  const [createActorDefaultOrgUnitId, setCreateActorDefaultOrgUnitId] = useState('');
  const [selectedNodeKeys, setSelectedNodeKeys] = useState<Set<TreeNodeKey>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{ keys: TreeNodeKey[]; labels: string[] } | null>(null);
  const selectionAnchorRef = useRef<TreeNodeKey | null>(null);
  const manifestById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const displayOperators = useMemo(
    () =>
      operators.map((operator) => {
        if (!operator.sourceAgentId) {
          return operator;
        }
        const manifest = manifestById.get(operator.sourceAgentId);
        if (!manifest) {
          return operator;
        }
        return {
          ...operator,
          name: manifest.name,
          title: manifest.role,
          primaryObjective: manifest.primaryObjective,
          systemDirective: manifest.systemDirectiveShort,
          avatarSourceDataUrl: manifest.avatarSourceDataUrl,
          avatarDataUrl: manifest.avatarDataUrl
        };
      }),
    [operators, manifestById]
  );
  const getDisplayOperatorById = (id: string) => displayOperators.find((operator) => operator.id === id);

  const selection = useOrgChartSelectionState({
    businessUnits,
    orgUnits,
    operators: displayOperators,
    getOrgUnitById,
    getOperatorById: getDisplayOperatorById
  });
  const collapse = useOrgChartCollapseState();
  const treeProjection = useOrgChartTreeProjection({ operators: displayOperators, orgUnits, businessUnits });
  const visibleNodeOrder = useMemo<TreeNodeKey[]>(() => {
    const out: TreeNodeKey[] = [];
    const walkOrg = (node: { unit: { id: string } ; children: Array<{ unit: { id: string }; children: unknown[] }> }) => {
      const orgKey = `org_unit:${node.unit.id}` as TreeNodeKey;
      out.push(orgKey);
      if (!collapse.collapsedOrgUnitIds.has(node.unit.id)) {
        const actorTree = buildOperatorTree(displayOperators, node.unit.id);
        const walkActor = (actorNode: { operator: { id: string }; children: unknown[] }) => {
          const operatorKey = `operator:${actorNode.operator.id}` as TreeNodeKey;
          out.push(operatorKey);
          if (!collapse.collapsedActorIds.has(actorNode.operator.id)) {
            actorNode.children.forEach((child) => walkActor(child as { operator: { id: string }; children: unknown[] }));
          }
        };
        actorTree.forEach((actorNode) => walkActor(actorNode as { operator: { id: string }; children: unknown[] }));
        node.children.forEach((child) => walkOrg(child as { unit: { id: string }; children: Array<{ unit: { id: string }; children: unknown[] }> }));
      }
    };
    const walkBusinessUnit = (node: { id: string; children: Array<{ id: string; children: unknown[] }> }) => {
      const businessKey = `business_unit:${node.id}` as TreeNodeKey;
      out.push(businessKey);
      if (!collapse.collapsedBusinessUnitIds.has(node.id)) {
        (treeProjection.orgRootsByBusinessUnit.get(node.id) ?? []).forEach((orgRoot) =>
          walkOrg(orgRoot as { unit: { id: string }; children: Array<{ unit: { id: string }; children: unknown[] }> })
        );
        node.children.forEach((child) => walkBusinessUnit(child as { id: string; children: Array<{ id: string; children: unknown[] }> }));
      }
    };

    treeProjection.businessUnitTree.forEach((node) =>
      walkBusinessUnit(node as { id: string; children: Array<{ id: string; children: unknown[] }> })
    );

    if (treeProjection.unassignedOrgRoots.length > 0) {
      out.push('scope_bucket:unassigned');
      if (!collapse.collapsedScopeBuckets.has('unassigned')) {
        treeProjection.unassignedOrgRoots.forEach((root) =>
          walkOrg(root as { unit: { id: string }; children: Array<{ unit: { id: string }; children: unknown[] }> })
        );
      }
    }
    return out;
  }, [
    collapse.collapsedActorIds,
    collapse.collapsedBusinessUnitIds,
    collapse.collapsedOrgUnitIds,
    collapse.collapsedScopeBuckets,
    displayOperators,
    treeProjection.businessUnitTree,
    treeProjection.orgRootsByBusinessUnit,
    treeProjection.unassignedOrgRoots
  ]);
  const actions = useOrgChartSurfaceActions({
    execute,
    selectedNode: selection.selectedNode,
    setSelectedNode: selection.setSelectedNode,
    orgUnits,
    getOperatorById,
    deleteAgent
  });
  const nodeLabelByKey = useMemo(() => {
    const labels = new Map<TreeNodeKey, string>();
    businessUnits.forEach((unit) => labels.set(`business_unit:${unit.id}`, unit.name));
    orgUnits.forEach((unit) => labels.set(`org_unit:${unit.id}`, unit.name));
    displayOperators.forEach((operator) => labels.set(`operator:${operator.id}`, `${operator.name} (${operator.title})`));
    labels.set('scope_bucket:unassigned', 'Unassigned');
    return labels;
  }, [businessUnits, orgUnits, displayOperators]);
  const handleTreeNodeClick = (next: SelectedNode, options?: { shiftKey?: boolean }) => {
    if (!next) {
      selection.setSelectedNode(null);
      setSelectedNodeKeys(new Set());
      selectionAnchorRef.current = null;
      return;
    }
    selection.setSelectedNode(next);
    const clickedKey = keyForSelectedNode(next);
    if (!options?.shiftKey || !selectionAnchorRef.current) {
      setSelectedNodeKeys(new Set<TreeNodeKey>([clickedKey]));
      selectionAnchorRef.current = clickedKey;
      return;
    }
    const anchorKey = selectionAnchorRef.current;
    const startIndex = visibleNodeOrder.indexOf(anchorKey);
    const endIndex = visibleNodeOrder.indexOf(clickedKey);
    if (startIndex < 0 || endIndex < 0) {
      setSelectedNodeKeys(new Set<TreeNodeKey>([clickedKey]));
      selectionAnchorRef.current = clickedKey;
      return;
    }
    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const range = visibleNodeOrder.slice(from, to + 1);
    setSelectedNodeKeys(new Set(range));
  };
  const handleConfirmBulkDelete = () => {
    if (!pendingBulkDelete) {
      return;
    }
    const keys = pendingBulkDelete.keys;
    const operatorIds = keys
      .filter((key) => key.startsWith('operator:'))
      .map((key) => key.slice('operator:'.length));
    const orgUnitIds = keys
      .filter((key) => key.startsWith('org_unit:'))
      .map((key) => key.slice('org_unit:'.length));
    const businessUnitIds = keys
      .filter((key) => key.startsWith('business_unit:'))
      .map((key) => key.slice('business_unit:'.length));
    const orgUnitById = new Map(orgUnits.map((unit) => [unit.id, unit]));
    const businessUnitById = new Map(businessUnits.map((unit) => [unit.id, unit]));
    const orgDepth = (id: string): number => {
      let depth = 0;
      let cursor = orgUnitById.get(id);
      while (cursor?.parentOrgUnitId) {
        depth += 1;
        cursor = orgUnitById.get(cursor.parentOrgUnitId);
      }
      return depth;
    };
    const businessDepth = (id: string): number => {
      let depth = 0;
      let cursor = businessUnitById.get(id);
      while (cursor?.parentBusinessUnitId) {
        depth += 1;
        cursor = businessUnitById.get(cursor.parentBusinessUnitId);
      }
      return depth;
    };

    operatorIds.forEach((operatorId) => {
      const operator = getOperatorById(operatorId);
      if (operator?.sourceAgentId) {
        deleteAgent(operator.sourceAgentId);
      }
      actions.executeCommand({ kind: 'delete_operator', operatorId });
    });
    orgUnitIds
      .slice()
      .sort((a, b) => orgDepth(b) - orgDepth(a))
      .forEach((nodeId) => actions.executeCommand({ kind: 'delete_org_unit', nodeId }));
    businessUnitIds
      .slice()
      .sort((a, b) => businessDepth(b) - businessDepth(a))
      .forEach((nodeId) => actions.executeCommand({ kind: 'delete_business_unit', nodeId }));

    setPendingBulkDelete(null);
    setSelectedNodeKeys(new Set());
    selectionAnchorRef.current = null;
    selection.setSelectedNode(null);
  };

  useEffect(() => {
    const selected = selection.selectedNode;
    if (!selected) {
      setSelectedNodeKeys((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    const selectedKey = keyForSelectedNode(selected);
    setSelectedNodeKeys((current) => {
      if (current.size === 1 && current.has(selectedKey)) {
        return current;
      }
      if (current.size > 1 && current.has(selectedKey)) {
        return current;
      }
      return new Set<TreeNodeKey>([selectedKey]);
    });
    selectionAnchorRef.current = selectedKey;
  }, [selection.selectedNode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isDeleteKey =
        event.key === 'Delete' ||
        event.key === 'Backspace' ||
        event.code === 'Delete' ||
        event.code === 'Backspace';
      if (!isDeleteKey) {
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        const isTypingTarget =
          tagName === 'input' ||
          tagName === 'textarea' ||
          activeElement.isContentEditable;
        if (isTypingTarget) {
          return;
        }
      }
      const deletableKeys = Array.from(selectedNodeKeys).filter(
        (key) => !key.startsWith('scope_bucket:')
      );
      if (deletableKeys.length === 0) {
        return;
      }
      event.preventDefault();
      const labels = deletableKeys.map((key) => nodeLabelByKey.get(key) ?? key);
      setPendingBulkDelete({ keys: deletableKeys, labels });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nodeLabelByKey, selectedNodeKeys]);

  const mediaEditor = useOrgChartMediaEditor({
    onSave: (target, sourceDataUrl, croppedDataUrl) => {
      if (target.kind === 'business_unit') {
        actions.executeCommand({
          kind: 'set_business_unit_logo',
          nodeId: target.id,
          sourceDataUrl,
          croppedDataUrl
        });
        return;
      }
      if (target.kind === 'org_unit') {
        actions.executeCommand({
          kind: 'set_org_unit_icon',
          nodeId: target.id,
          sourceDataUrl,
          croppedDataUrl
        });
        return;
      }
      const operator = getOperatorById(target.id);
      if (!operator?.sourceAgentId) {
        actions.executeCommand({
          kind: 'set_operator_avatar',
          operatorId: target.id,
          sourceDataUrl,
          croppedDataUrl
        });
      }
      syncLinkedAgentManifest(target.id, undefined, { sourceDataUrl, croppedDataUrl });
    }
  });

  const dnd = useOrgChartPointerDnd({
    enabled: selection.hierarchyMode,
    orgUnits,
    businessUnits,
    operators: displayOperators,
    onCommand: actions.executeCommand
  });
  const selectedBusinessUnit = selection.selectedBusinessUnit;
  const selectedOrg = selection.selectedOrg;
  const selectedOperator = selection.selectedOperator;
  const syncLinkedAgentManifest = (
    operatorId: string,
    patch?: Partial<{
      name: string;
      title: string;
      primaryObjective: string;
      systemDirective: string;
      roleBrief: string;
    }>,
    avatar?: { sourceDataUrl: string; croppedDataUrl: string }
  ) => {
    const operator = getOperatorById(operatorId);
    if (!operator?.sourceAgentId) {
      return;
    }

    const existingManifest = agents.find((agent) => agent.agentId === operator.sourceAgentId);
    const merged = {
      ...operator,
      ...(patch ?? {}),
      avatarSourceDataUrl:
        avatar?.sourceDataUrl ??
        existingManifest?.avatarSourceDataUrl ??
        operator.avatarSourceDataUrl,
      avatarDataUrl:
        avatar?.croppedDataUrl ??
        existingManifest?.avatarDataUrl ??
        operator.avatarDataUrl
    };
    updateAgent(operator.sourceAgentId, {
      avatarSourceDataUrl: merged.avatarSourceDataUrl,
      avatarDataUrl: merged.avatarDataUrl,
      name: merged.name,
      role: merged.title,
      primaryObjective: merged.primaryObjective,
      systemDirectiveShort: merged.systemDirective,
      toolsPolicyRef: existingManifest?.toolsPolicyRef ?? 'policy_default'
    });
  };
  const openBusinessUnitMedia = (businessUnit: NonNullable<typeof selectedBusinessUnit>) => {
    mediaEditor.openMediaEditor(
      { kind: 'business_unit', id: businessUnit.id },
      businessUnit.logoSourceDataUrl,
      businessUnit.logoDataUrl
    );
  };
  const openOrgUnitMedia = (orgUnit: NonNullable<typeof selectedOrg>) => {
    mediaEditor.openMediaEditor({ kind: 'org_unit', id: orgUnit.id }, orgUnit.iconSourceDataUrl, orgUnit.iconDataUrl);
  };
  const openActorMedia = (operator: NonNullable<typeof selectedOperator>) => {
    mediaEditor.openMediaEditor({ kind: 'operator', id: operator.id }, operator.avatarSourceDataUrl, operator.avatarDataUrl);
  };
  const closeCreateModal = () => {
    setCreateEntityKind(null);
    setCreateActorDefaultOrgUnitId('');
  };
  const openCreateActorModal = () => {
    const suggestedOrgUnitId = actions.getSuggestedActorOrgUnitId() ?? '';
    setCreateActorDefaultOrgUnitId(suggestedOrgUnitId);
    setCreateEntityKind('operator');
  };
  const createManagerOptions = useMemo(
    () => [
      { value: '', label: 'No manager' },
      ...displayOperators.map((operator) => ({
        value: operator.id,
        label: `${operator.name} (${operator.title})`
      }))
    ],
    [displayOperators]
  );

  const buildAgentInput = (input: {
    name: string;
    role: string;
    primaryObjective: string;
    directive: string;
    avatarDataUrl?: string;
  }) => {
    const base = createDefaultAgentManifestInput();
    return {
      ...base,
      name: input.name.trim(),
      role: input.role.trim(),
      primaryObjective: input.primaryObjective.trim(),
      systemDirectiveShort: input.directive.trim(),
      avatarDataUrl: input.avatarDataUrl ?? '',
      avatarSourceDataUrl: ''
    };
  };

  return (
    <section className="agent-chart-surface">
      <LeftColumnShell
        width="wide"
        left={
          <OrgChartLeftPane
            errorMessage={actions.errorMessage}
            onAddOrgUnit={() => setCreateEntityKind('org_unit')}
            onAddBusinessUnit={() => setCreateEntityKind('business_unit')}
            onAddOperator={openCreateActorModal}
            hierarchyMode={selection.hierarchyMode}
            onToggleHierarchyMode={() => selection.setHierarchyMode((current) => !current)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            selectedNode={selection.selectedNode}
            selectedNodeKeys={selectedNodeKeys}
            onNodeClick={(next, options) => handleTreeNodeClick(next, options)}
            operators={displayOperators}
            orgUnits={orgUnits}
            businessUnits={businessUnits}
            businessUnitTree={treeProjection.businessUnitTree}
            orgRootsByBusinessUnit={treeProjection.orgRootsByBusinessUnit}
            unassignedOrgRoots={treeProjection.unassignedOrgRoots}
            reportCountByManager={treeProjection.reportCountByManager}
            collapsedBusinessUnitIds={collapse.collapsedBusinessUnitIds}
            collapsedOrgUnitIds={collapse.collapsedOrgUnitIds}
            collapsedActorIds={collapse.collapsedActorIds}
            collapsedScopeBuckets={collapse.collapsedScopeBuckets}
            toggleCollapsedId={collapse.toggleCollapsedId}
            toggleCollapsedScopeBucket={collapse.toggleCollapsedScopeBucket}
            setCollapsedBusinessUnitIds={collapse.setCollapsedBusinessUnitIds}
            setCollapsedOrgUnitIds={collapse.setCollapsedOrgUnitIds}
            setCollapsedActorIds={collapse.setCollapsedActorIds}
            dnd={dnd}
          />
        }
        right={
          <OrgChartRightPane
            selection={selection}
            operators={displayOperators}
            selectedBusinessUnit={selectedBusinessUnit}
            selectedOrg={selectedOrg}
            selectedOperator={selectedOperator}
            executeCommand={actions.executeCommand}
            onSaveOperatorPatch={(operator, patch) => {
              if (!operator.sourceAgentId) {
                actions.executeCommand({
                  kind: 'update_operator',
                  operatorId: operator.id,
                  patch
                });
              }
              syncLinkedAgentManifest(operator.id, patch);
            }}
            setPendingDelete={actions.setPendingDelete}
            onOpenBusinessUnitMedia={openBusinessUnitMedia}
            onOpenOrgUnitMedia={openOrgUnitMedia}
            onOpenActorMedia={openActorMedia}
          />
        }
      />
      <OrgEntityCreateModal
        open={createEntityKind != null}
        entityKind={createEntityKind ?? 'business_unit'}
        defaultOrgUnitId={createActorDefaultOrgUnitId}
        orgUnitOptions={selection.orgOptions}
        managerOptions={createManagerOptions}
        onClose={closeCreateModal}
        onCreateBusinessUnit={(input) => {
          actions.createBusinessUnit(input);
        }}
        onCreateOrgUnit={(input) => {
          actions.createOrgUnit(input);
        }}
        onCreateActor={(input) => {
          if (input.kind === 'agent') {
            const createdAgent = createAgent(
              buildAgentInput({
                name: input.name,
                role: input.title,
                primaryObjective: input.primaryObjective,
                directive: input.systemDirective,
                avatarDataUrl: input.avatarDataUrl
              })
            );
            const created = actions.createActor({
              ...input,
              managerOperatorId: input.managerOperatorId || null,
              sourceAgentId: createdAgent.agentId
            });
            if (!created) {
              return false;
            }
            return true;
          }

          return actions.createActor({
            ...input,
            managerOperatorId: input.managerOperatorId || null
          });
        }}
      />
      <OrgChartDragChip chip={dnd.dragChipMeta} />
      <AgentAvatarCropModal
        open={mediaEditor.cropOpen}
        sourceDataUrl={mediaEditor.pendingMediaSource}
        onCancel={mediaEditor.handleMediaCropCancel}
        onReplaceImage={mediaEditor.handleMediaReplaceImage}
        onConfirm={mediaEditor.handleMediaCropConfirm}
      />
      <ConfirmDialogModal
        open={actions.pendingDelete != null}
        title={`Delete ${actions.pendingDelete?.kind === 'business_unit' ? 'Business Unit' : actions.pendingDelete?.kind === 'org_unit' ? 'Org Unit' : 'Operator'}?`}
        message={`This action cannot be undone. ${actions.pendingDelete?.label ?? 'Selected item'} will be removed.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onCancel={() => actions.setPendingDelete(null)}
        onConfirm={actions.handleConfirmDelete}
      />
      <ConfirmDialogModal
        open={pendingBulkDelete != null}
        title={`Delete ${pendingBulkDelete?.keys.length ?? 0} selected item${(pendingBulkDelete?.keys.length ?? 0) === 1 ? '' : 's'}?`}
        message={`This action cannot be undone. ${pendingBulkDelete?.labels.slice(0, 5).join(', ')}${(pendingBulkDelete?.labels.length ?? 0) > 5 ? ` +${(pendingBulkDelete?.labels.length ?? 0) - 5} more` : ''} will be removed.`}
        confirmLabel="Delete Selected"
        confirmVariant="danger"
        onCancel={() => setPendingBulkDelete(null)}
        onConfirm={handleConfirmBulkDelete}
      />
      <input
        ref={mediaEditor.mediaInputRef}
        type="file"
        accept="image/*"
        className="agent-chart-media-input"
        onChange={mediaEditor.handleMediaFileChange}
      />
    </section>
  );
}
