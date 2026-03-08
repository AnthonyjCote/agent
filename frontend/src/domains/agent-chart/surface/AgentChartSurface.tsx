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

import { useOrgChartStore } from '../../../shared/config';
import { ConfirmDialogModal, LeftColumnShell } from '../../../shared/ui';
import { useOrgChartPointerDnd } from '../model';
import { OrgChartDragChip } from './OrgChartDragChip';
import { AgentAvatarCropModal } from '../../../shared/modules/agent-manifest';
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
  const { businessUnits, orgUnits, actors, execute, canUndo, canRedo, undo, redo, getOrgUnitById, getActorById } =
    useOrgChartStore();

  const selection = useOrgChartSelectionState({
    businessUnits,
    orgUnits,
    actors,
    getOrgUnitById,
    getActorById
  });
  const collapse = useOrgChartCollapseState();
  const treeProjection = useOrgChartTreeProjection({ actors, orgUnits, businessUnits });
  const actions = useOrgChartSurfaceActions({
    execute,
    selectedNode: selection.selectedNode,
    setSelectedNode: selection.setSelectedNode,
    orgUnits,
    getActorById
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
        kind: 'set_actor_avatar',
        actorId: target.id,
        sourceDataUrl,
        croppedDataUrl
      });
    }
  });

  const dnd = useOrgChartPointerDnd({
    enabled: selection.hierarchyMode,
    orgUnits,
    businessUnits,
    actors,
    onCommand: actions.executeCommand
  });
  const selectedBusinessUnit = selection.selectedBusinessUnit;
  const selectedOrg = selection.selectedOrg;
  const selectedActor = selection.selectedActor;
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
  const openActorMedia = (actor: NonNullable<typeof selectedActor>) => {
    mediaEditor.openMediaEditor({ kind: 'actor', id: actor.id }, actor.avatarSourceDataUrl, actor.avatarDataUrl);
  };

  return (
    <section className="agent-chart-surface">
      <LeftColumnShell
        width="wide"
        left={
          <OrgChartLeftPane
            errorMessage={actions.errorMessage}
            onAddOrgUnit={actions.addOrgUnit}
            onAddBusinessUnit={actions.addBusinessUnit}
            onAddActor={actions.addActor}
            hierarchyMode={selection.hierarchyMode}
            onToggleHierarchyMode={() => selection.setHierarchyMode((current) => !current)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            selectedNode={selection.selectedNode}
            setSelectedNode={selection.setSelectedNode}
            actors={actors}
            orgUnits={orgUnits}
            businessUnits={businessUnits}
            businessUnitTree={treeProjection.businessUnitTree}
            orgRootsByBusinessUnit={treeProjection.orgRootsByBusinessUnit}
            sharedOrgRoots={treeProjection.sharedOrgRoots}
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
            selectedActor={selectedActor}
            businessUnits={businessUnits}
            executeCommand={actions.executeCommand}
            setPendingDelete={actions.setPendingDelete}
            onOpenBusinessUnitMedia={openBusinessUnitMedia}
            onOpenOrgUnitMedia={openOrgUnitMedia}
            onOpenActorMedia={openActorMedia}
          />
        }
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
        title={`Delete ${actions.pendingDelete?.kind === 'business_unit' ? 'Business Unit' : actions.pendingDelete?.kind === 'org_unit' ? 'Org Unit' : 'Actor'}?`}
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
