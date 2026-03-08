import { DropdownSelector, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';
import type { OrgUnitScope } from '../../../../shared/config';
import { NodeMedia, NodeMediaIcon } from './NodeMedia';

type OrgUnit = {
  id: string;
  name: string;
  parentOrgUnitId: string | null;
  iconSourceDataUrl: string;
  iconDataUrl: string;
};

type OrgUnitDetailsCardProps = {
  orgUnit: OrgUnit;
  orgNameDraft: string;
  setOrgNameDraft: (next: string) => void;
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
      <button type="button" className="agent-chart-media-picker" onClick={onPickMedia}>
        <NodeMedia image={orgUnit.iconDataUrl} className="details" fallback={<NodeMediaIcon kind="org_unit" />} />
        <span>{orgUnit.iconDataUrl ? 'Edit Icon' : 'Select Icon'}</span>
      </button>
      <label className="agent-chart-field-label" htmlFor="org-unit-name">
        Name
      </label>
      <TextField value={orgNameDraft} onValueChange={setOrgNameDraft} ariaLabel="Org unit name" placeholder="Org unit name" />
      <label className="agent-chart-field-label" htmlFor="org-unit-parent">
        Parent Org Unit
      </label>
      <DropdownSelector value={orgUnit.parentOrgUnitId ?? ''} options={orgParentOptions} onValueChange={onMoveParent} ariaLabel="Org unit parent" />
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

