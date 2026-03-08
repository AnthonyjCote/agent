import { DropdownSelector, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';
import { NodeMedia, NodeMediaIcon } from './NodeMedia';

type BusinessUnit = {
  id: string;
  name: string;
  parentBusinessUnitId: string | null;
  logoSourceDataUrl: string;
  logoDataUrl: string;
};

type BusinessUnitDetailsCardProps = {
  businessUnit: BusinessUnit;
  businessUnitNameDraft: string;
  setBusinessUnitNameDraft: (next: string) => void;
  businessUnitParentOptions: DropdownOption[];
  onMoveParent: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onPickMedia: () => void;
};

export function BusinessUnitDetailsCard(props: BusinessUnitDetailsCardProps) {
  const {
    businessUnit,
    businessUnitNameDraft,
    setBusinessUnitNameDraft,
    businessUnitParentOptions,
    onMoveParent,
    onSave,
    onDelete,
    onPickMedia
  } = props;

  return (
    <div className="agent-chart-details-card">
      <h2>Business Unit</h2>
      <button type="button" className="agent-chart-media-picker" onClick={onPickMedia}>
        <NodeMedia image={businessUnit.logoDataUrl} className="business-unit details" fallback={<NodeMediaIcon kind="business_unit" />} />
        <span>{businessUnit.logoDataUrl ? 'Edit Logo' : 'Select Logo'}</span>
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
        value={businessUnit.parentBusinessUnitId ?? ''}
        options={businessUnitParentOptions}
        onValueChange={onMoveParent}
        ariaLabel="Business unit parent"
      />
      <div className="agent-chart-details-actions">
        <TextButton label="Delete" variant="danger" onClick={onDelete} />
        <TextButton label="Save" variant="primary" onClick={onSave} />
      </div>
    </div>
  );
}

