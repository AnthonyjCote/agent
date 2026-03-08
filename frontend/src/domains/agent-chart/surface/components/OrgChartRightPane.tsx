import type { Operator, BusinessUnit, OrgCommand, OrgUnit } from '../../../../shared/config';
import { TopRailShell } from '../../../../shared/ui';
import type { PendingDelete } from '../types';
import type { OrgChartSelectionState } from '../hooks';
import { ActorDetailsCard } from './ActorDetailsCard';
import { BusinessUnitDetailsCard } from './BusinessUnitDetailsCard';
import { OrgUnitDetailsCard } from './OrgUnitDetailsCard';

type OrgChartRightPaneProps = {
  selection: OrgChartSelectionState;
  selectedBusinessUnit: BusinessUnit | undefined;
  selectedOrg: OrgUnit | undefined;
  selectedOperator: Operator | undefined;
  executeCommand: (command: OrgCommand) => void;
  setPendingDelete: (next: PendingDelete) => void;
  onOpenBusinessUnitMedia: (businessUnit: BusinessUnit) => void;
  onOpenOrgUnitMedia: (orgUnit: OrgUnit) => void;
  onOpenActorMedia: (operator: Operator) => void;
};

export function OrgChartRightPane(props: OrgChartRightPaneProps) {
  const {
    selection,
    selectedBusinessUnit,
    selectedOrg,
    selectedOperator,
    executeCommand,
    setPendingDelete,
    onOpenBusinessUnitMedia,
    onOpenOrgUnitMedia,
    onOpenActorMedia
  } = props;

  return (
    <section className="agent-chart-right-pane" aria-label="Org item details">
      <TopRailShell
        tone="raised"
        left={
          <div className="agent-chart-workspace-meta">
            <span className="agent-chart-workspace-title">Org Workspace</span>
            <span className="agent-chart-workspace-status">
              {selection.workspaceView === 'list' ? 'List View' : 'Canvas View'} ·{' '}
              {selection.hierarchyMode ? 'Hierarchy Edit On' : 'Hierarchy Edit Off'}
            </span>
          </div>
        }
        right={
          <div className="agent-chart-view-toggle">
            <button
              type="button"
              className={`agent-chart-view-toggle-button${selection.workspaceView === 'list' ? ' active' : ''}`}
              onClick={() => selection.setWorkspaceView('list')}
              aria-pressed={selection.workspaceView === 'list'}
            >
              List
            </button>
            <button
              type="button"
              className={`agent-chart-view-toggle-button${selection.workspaceView === 'canvas' ? ' active' : ''}`}
              onClick={() => selection.setWorkspaceView('canvas')}
              aria-pressed={selection.workspaceView === 'canvas'}
            >
              Canvas
            </button>
          </div>
        }
      />
      <div className="agent-chart-right-pane-body">

      {selection.workspaceView === 'list' && selectedBusinessUnit ? (
        <BusinessUnitDetailsCard
          businessUnit={selectedBusinessUnit}
          businessUnitNameDraft={selection.businessUnitNameDraft}
          setBusinessUnitNameDraft={selection.setBusinessUnitNameDraft}
          businessUnitOverviewDraft={selection.businessUnitOverviewDraft}
          setBusinessUnitOverviewDraft={selection.setBusinessUnitOverviewDraft}
          businessUnitParentOptions={selection.businessUnitParentOptions}
          onMoveParent={(value) =>
            executeCommand({
              kind: 'move_business_unit',
              nodeId: selectedBusinessUnit.id,
              newParentId: value || null
            })
          }
          onSave={() =>
            executeCommand({
              kind: 'update_business_unit',
              nodeId: selectedBusinessUnit.id,
              patch: {
                name: selection.businessUnitNameDraft,
                shortDescription: selection.businessUnitOverviewDraft
              }
            })
          }
          onDelete={() =>
            setPendingDelete({
              kind: 'business_unit',
              id: selectedBusinessUnit.id,
              label: selectedBusinessUnit.name
            })
          }
          onPickMedia={() => onOpenBusinessUnitMedia(selectedBusinessUnit)}
        />
      ) : null}

      {selection.workspaceView === 'list' && selectedOrg ? (
        <OrgUnitDetailsCard
          orgUnit={selectedOrg}
          orgNameDraft={selection.orgNameDraft}
          setOrgNameDraft={selection.setOrgNameDraft}
          orgOverviewDraft={selection.orgOverviewDraft}
          setOrgOverviewDraft={selection.setOrgOverviewDraft}
          orgParentOptions={selection.orgParentOptions}
          selectedOrgChildren={selection.selectedOrgChildren}
          selectedOrgEffectiveBusinessUnitId={selection.selectedOrgEffectiveBusinessUnitId}
          businessUnitOptions={selection.businessUnitOptions}
          onMoveParent={(value) =>
            executeCommand({
              kind: 'move_org_unit',
              nodeId: selectedOrg.id,
              newParentId: value || null
            })
          }
          onChangeBusinessUnit={(value) =>
            executeCommand({
              kind: 'assign_org_unit_business_unit',
              orgUnitId: selectedOrg.id,
              businessUnitId: value || null
            })
          }
          onSave={() =>
            executeCommand({
              kind: 'update_org_unit',
              nodeId: selectedOrg.id,
              patch: {
                name: selection.orgNameDraft,
                shortDescription: selection.orgOverviewDraft
              }
            })
          }
          onDelete={() =>
            setPendingDelete({
              kind: 'org_unit',
              id: selectedOrg.id,
              label: selectedOrg.name
            })
          }
          onPickMedia={() => onOpenOrgUnitMedia(selectedOrg)}
        />
      ) : null}

      {selection.workspaceView === 'list' && selectedOperator ? (
        <ActorDetailsCard
          operator={selectedOperator}
          actorNameDraft={selection.actorNameDraft}
          actorTitleDraft={selection.actorTitleDraft}
          actorPrimaryObjectiveDraft={selection.actorPrimaryObjectiveDraft}
          actorSystemDirectiveDraft={selection.actorSystemDirectiveDraft}
          actorRoleBriefDraft={selection.actorRoleBriefDraft}
          setActorNameDraft={selection.setActorNameDraft}
          setActorTitleDraft={selection.setActorTitleDraft}
          setActorPrimaryObjectiveDraft={selection.setActorPrimaryObjectiveDraft}
          setActorSystemDirectiveDraft={selection.setActorSystemDirectiveDraft}
          setActorRoleBriefDraft={selection.setActorRoleBriefDraft}
          actorTypeOptions={selection.actorTypeOptions}
          orgOptions={selection.orgOptions}
          managerOptions={selection.managerOptions}
          onChangeKind={(value) =>
            executeCommand({ kind: 'update_operator', operatorId: selectedOperator.id, patch: { kind: value as Operator['kind'] } })
          }
          onChangeOrgUnit={(value) =>
            executeCommand({ kind: 'move_operator', operatorId: selectedOperator.id, targetOrgUnitId: value })
          }
          onChangeManager={(value) =>
            executeCommand({ kind: 'set_operator_manager', operatorId: selectedOperator.id, managerOperatorId: value || null })
          }
          onSave={() =>
            executeCommand({
              kind: 'update_operator',
              operatorId: selectedOperator.id,
              patch: {
                name: selection.actorNameDraft,
                title: selection.actorTitleDraft,
                primaryObjective: selection.actorPrimaryObjectiveDraft,
                systemDirective: selection.actorSystemDirectiveDraft,
                roleBrief: selection.actorRoleBriefDraft
              }
            })
          }
          onDelete={() =>
            setPendingDelete({
              kind: 'operator',
              id: selectedOperator.id,
              label: selectedOperator.name
            })
          }
          onPickMedia={() => onOpenActorMedia(selectedOperator)}
        />
      ) : null}

      {selection.workspaceView === 'list' && !selectedOperator && !selectedOrg && !selectedBusinessUnit ? (
        <div className="agent-chart-empty-details">
          <h2>Org Chart</h2>
          <p>Select an org unit or operator from the tree to edit details.</p>
        </div>
      ) : null}

      {selection.workspaceView === 'canvas' ? (
        <div className="agent-chart-canvas-placeholder">
          <h2>Org Canvas</h2>
          <p>Infinity canvas org graph view will be added next.</p>
        </div>
      ) : null}
      </div>
    </section>
  );
}
