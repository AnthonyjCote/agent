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

import { useState } from 'react';
import { createDefaultAgentManifestInput, useAgentManifestStore, useOrgChartStore } from '../../../shared/config';
import { ConfirmDialogModal, LeftColumnShell } from '../../../shared/ui';
import { useOrgChartPointerDnd } from '../model';
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
import './AgentChartSurface.css';


export function AgentChartSurface() {
  const { businessUnits, orgUnits, operators, execute, canUndo, canRedo, undo, redo, getOrgUnitById, getOperatorById } =
    useOrgChartStore();
  const { createAgent } = useAgentManifestStore();
  const [createEntityKind, setCreateEntityKind] = useState<'business_unit' | 'org_unit' | 'operator' | null>(null);
  const [createActorDefaultOrgUnitId, setCreateActorDefaultOrgUnitId] = useState('');

  const selection = useOrgChartSelectionState({
    businessUnits,
    orgUnits,
    operators,
    getOrgUnitById,
    getOperatorById
  });
  const collapse = useOrgChartCollapseState();
  const treeProjection = useOrgChartTreeProjection({ operators, orgUnits, businessUnits });
  const actions = useOrgChartSurfaceActions({
    execute,
    selectedNode: selection.selectedNode,
    setSelectedNode: selection.setSelectedNode,
    orgUnits,
    getOperatorById
  });

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
      actions.executeCommand({
        kind: 'set_operator_avatar',
        operatorId: target.id,
        sourceDataUrl,
        croppedDataUrl
      });
    }
  });

  const dnd = useOrgChartPointerDnd({
    enabled: selection.hierarchyMode,
    orgUnits,
    businessUnits,
    operators,
    onCommand: actions.executeCommand
  });
  const selectedBusinessUnit = selection.selectedBusinessUnit;
  const selectedOrg = selection.selectedOrg;
  const selectedOperator = selection.selectedOperator;
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
            setSelectedNode={selection.setSelectedNode}
            operators={operators}
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
            selectedBusinessUnit={selectedBusinessUnit}
            selectedOrg={selectedOrg}
            selectedOperator={selectedOperator}
            executeCommand={actions.executeCommand}
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
              sourceAgentId: createdAgent.agentId
            });
            if (!created) {
              return false;
            }
            return true;
          }

          return actions.createActor(input);
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
