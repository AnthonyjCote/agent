import { AgentAvatar, DropdownSelector, TextAreaField, TextButton, TextField, type DropdownOption } from '@/shared/ui';

type OrgUnit = {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  iconSourceDataUrl: string;
  iconDataUrl: string;
  shortDescription: string;
};

type OrgUnitDetailsCardProps = {
  orgUnit: OrgUnit;
  orgNameDraft: string;
  setOrgNameDraft: (next: string) => void;
  orgOverviewDraft: string;
  setOrgOverviewDraft: (next: string) => void;
  orgParentOptions: DropdownOption[];
  selectedOrgChildren: Array<{ id: string; name: string }>;
  selectedOrgEffectiveBusinessUnitId: string | null;
  businessUnitOptions: DropdownOption[];
  onMoveParent: (value: string) => void;
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
    orgParentOptions,
    selectedOrgChildren,
    selectedOrgEffectiveBusinessUnitId,
    businessUnitOptions,
    onMoveParent,
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
        Short Description
      </label>
      <TextAreaField value={orgOverviewDraft} onValueChange={setOrgOverviewDraft} ariaLabel="Org unit short description" />
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
      <label className="agent-chart-field-label" htmlFor="org-unit-business-unit">
        Business Unit
      </label>
      <DropdownSelector
        value={selectedOrgEffectiveBusinessUnitId ?? ''}
        options={businessUnitOptions}
        onValueChange={onChangeBusinessUnit}
        ariaLabel="Org unit business unit"
      />
      <div className="agent-chart-details-actions">
        <TextButton label="Delete" variant="danger" onClick={onDelete} />
        <TextButton label="Save" variant="primary" onClick={onSave} />
      </div>
    </div>
  );
}
