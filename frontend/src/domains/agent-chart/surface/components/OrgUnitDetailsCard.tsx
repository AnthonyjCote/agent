import { AgentAvatar, DropdownSelector, TextAreaField, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';
import type { OrgUnitScope } from '../../../../shared/config';

type OrgUnit = {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  iconSourceDataUrl: string;
  iconDataUrl: string;
  overview: string;
  coreResponsibilities: string;
  primaryDeliverables: string;
  workingModel: 'human' | 'agent' | 'hybrid';
};

type OrgUnitDetailsCardProps = {
  orgUnit: OrgUnit;
  orgNameDraft: string;
  setOrgNameDraft: (next: string) => void;
  orgOverviewDraft: string;
  setOrgOverviewDraft: (next: string) => void;
  orgResponsibilitiesDraft: string;
  setOrgResponsibilitiesDraft: (next: string) => void;
  orgDeliverablesDraft: string;
  setOrgDeliverablesDraft: (next: string) => void;
  orgWorkingModelDraft: OrgUnit['workingModel'];
  setOrgWorkingModelDraft: (next: OrgUnit['workingModel']) => void;
  orgParentOptions: DropdownOption[];
  selectedOrgChildren: Array<{ id: string; name: string }>;
  selectedOrgIsTopLevel: boolean;
  selectedOrgTopLevelName: string | null;
  selectedOrgEffectiveScope: OrgUnitScope;
  selectedOrgEffectiveBusinessUnitId: string | null;
  selectedOrgEffectiveBusinessUnitName: string | null;
  orgScopeOptions: DropdownOption[];
  businessUnitOptions: DropdownOption[];
  scopeLabels: Record<OrgUnitScope, string>;
  fallbackBusinessUnitId: string | null;
  onMoveParent: (value: string) => void;
  onChangeScope: (scope: OrgUnitScope, businessUnitId: string | null) => void;
  onChangeBusinessUnit: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onPickMedia: () => void;
};

export function OrgUnitDetailsCard(props: OrgUnitDetailsCardProps) {
  const {
    orgUnit,
    orgNameDraft,
    setOrgNameDraft,
    orgOverviewDraft,
    setOrgOverviewDraft,
    orgResponsibilitiesDraft,
    setOrgResponsibilitiesDraft,
    orgDeliverablesDraft,
    setOrgDeliverablesDraft,
    orgWorkingModelDraft,
    setOrgWorkingModelDraft,
    orgParentOptions,
    selectedOrgChildren,
    selectedOrgIsTopLevel,
    selectedOrgTopLevelName,
    selectedOrgEffectiveScope,
    selectedOrgEffectiveBusinessUnitId,
    selectedOrgEffectiveBusinessUnitName,
    orgScopeOptions,
    businessUnitOptions,
    scopeLabels,
    fallbackBusinessUnitId,
    onMoveParent,
    onChangeScope,
    onChangeBusinessUnit,
    onSave,
    onDelete,
    onPickMedia
  } = props;

  return (
    <div className="agent-chart-details-card">
      <h2>Org Unit</h2>
      <button type="button" className="agent-chart-avatar-button" onClick={onPickMedia}>
        <AgentAvatar name={orgUnit.name || 'Org Unit'} src={orgUnit.iconDataUrl || undefined} size="xl" shape="circle" />
        <span>Select Profile Image</span>
      </button>
      <label className="agent-chart-field-label" htmlFor="org-unit-name">
        Name
      </label>
      <TextField value={orgNameDraft} onValueChange={setOrgNameDraft} ariaLabel="Org unit name" placeholder="Org unit name" />
      <label className="agent-chart-field-label" htmlFor="org-unit-overview">
        Overview
      </label>
      <TextAreaField value={orgOverviewDraft} onValueChange={setOrgOverviewDraft} ariaLabel="Org unit overview" />
      <label className="agent-chart-field-label" htmlFor="org-unit-core-responsibilities">
        Core Responsibilities
      </label>
      <TextAreaField value={orgResponsibilitiesDraft} onValueChange={setOrgResponsibilitiesDraft} ariaLabel="Org unit core responsibilities" />
      <label className="agent-chart-field-label" htmlFor="org-unit-primary-deliverables">
        Primary Deliverables
      </label>
      <TextAreaField value={orgDeliverablesDraft} onValueChange={setOrgDeliverablesDraft} ariaLabel="Org unit primary deliverables" />
      <label className="agent-chart-field-label" htmlFor="org-unit-working-model">
        Working Model
      </label>
      <DropdownSelector
        value={orgWorkingModelDraft}
        options={[
          { value: 'human', label: 'Human' },
          { value: 'agent', label: 'Agent' },
          { value: 'hybrid', label: 'Hybrid' }
        ]}
        onValueChange={(value) => setOrgWorkingModelDraft(value as OrgUnit['workingModel'])}
        ariaLabel="Org unit working model"
      />
      <label className="agent-chart-field-label" htmlFor="org-unit-parent">
        Parent Org Unit
      </label>
      <DropdownSelector value={orgUnit.parentOrgUnitId ?? ''} options={orgParentOptions} onValueChange={onMoveParent} ariaLabel="Org unit parent" />
      <div className="agent-chart-child-org-list">
        <span className="agent-chart-field-label">Sub-units</span>
        {selectedOrgChildren.length === 0 ? (
          <p className="agent-chart-field-hint">No sub-units.</p>
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
          onChangeScope(value as OrgUnitScope, (value as OrgUnitScope) === 'business_unit' ? (selectedOrgEffectiveBusinessUnitId ?? fallbackBusinessUnitId) : null)
        }
        ariaLabel="Org unit scope"
      />
      {!selectedOrgIsTopLevel ? (
        <p className="agent-chart-field-hint">
          Inherited from top-level org unit: {selectedOrgTopLevelName ?? 'Unknown'} ({scopeLabels[selectedOrgEffectiveScope]}).
        </p>
      ) : null}
      <label className="agent-chart-field-label" htmlFor="org-unit-business-unit">
        Business Unit
      </label>
      <DropdownSelector
        value={selectedOrgEffectiveBusinessUnitId ?? ''}
        options={businessUnitOptions}
        disabled={!selectedOrgIsTopLevel || selectedOrgEffectiveScope !== 'business_unit'}
        onValueChange={onChangeBusinessUnit}
        ariaLabel="Org unit business unit"
      />
      {!selectedOrgIsTopLevel && selectedOrgEffectiveScope === 'business_unit' ? (
        <p className="agent-chart-field-hint">
          Inherited from top-level org unit: {selectedOrgTopLevelName ?? 'Unknown'} ({selectedOrgEffectiveBusinessUnitName ?? 'Unassigned'}).
        </p>
      ) : null}
      <div className="agent-chart-details-actions">
        <TextButton label="Delete" variant="danger" onClick={onDelete} />
        <TextButton label="Save" variant="primary" onClick={onSave} />
      </div>
    </div>
  );
}
