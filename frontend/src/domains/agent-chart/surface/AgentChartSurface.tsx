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

import { useMemo, useState } from 'react';
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
  const { agents, createAgent, updateAgent, deleteAgent } = useAgentManifestStore();
  const [createEntityKind, setCreateEntityKind] = useState<'business_unit' | 'org_unit' | 'operator' | null>(null);
  const [createActorDefaultOrgUnitId, setCreateActorDefaultOrgUnitId] = useState('');
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
  const actions = useOrgChartSurfaceActions({
    execute,
    selectedNode: selection.selectedNode,
    setSelectedNode: selection.setSelectedNode,
    orgUnits,
    getOperatorById,
    deleteAgent
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
            setSelectedNode={selection.setSelectedNode}
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
