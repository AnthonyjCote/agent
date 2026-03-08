import { AgentAvatar, DropdownSelector, TextAreaField, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';

type BusinessUnit = {
  id: string;
  name: string;
  parentBusinessUnitId: string | null;
  logoSourceDataUrl: string;
  logoDataUrl: string;
  overview: string;
  objectives: string;
  primaryProductsOrServices: string;
  successMetrics: string;
};

type BusinessUnitDetailsCardProps = {
  businessUnit: BusinessUnit;
  businessUnitNameDraft: string;
  setBusinessUnitNameDraft: (next: string) => void;
  businessUnitOverviewDraft: string;
  setBusinessUnitOverviewDraft: (next: string) => void;
  businessUnitObjectivesDraft: string;
  setBusinessUnitObjectivesDraft: (next: string) => void;
  businessUnitProductsDraft: string;
  setBusinessUnitProductsDraft: (next: string) => void;
  businessUnitMetricsDraft: string;
  setBusinessUnitMetricsDraft: (next: string) => void;
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
    businessUnitOverviewDraft,
    setBusinessUnitOverviewDraft,
    businessUnitObjectivesDraft,
    setBusinessUnitObjectivesDraft,
    businessUnitProductsDraft,
    setBusinessUnitProductsDraft,
    businessUnitMetricsDraft,
    setBusinessUnitMetricsDraft,
    businessUnitParentOptions,
    onMoveParent,
    onSave,
    onDelete,
    onPickMedia
  } = props;

  return (
    <div className="agent-chart-details-card">
      <h2>Business Unit</h2>
      <button type="button" className="agent-chart-avatar-button" onClick={onPickMedia}>
        <AgentAvatar name={businessUnit.name || 'Business Unit'} src={businessUnit.logoDataUrl || undefined} size="xl" shape="circle" />
        <span>Select Profile Image</span>
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
      <label className="agent-chart-field-label" htmlFor="business-unit-overview">
        Overview
      </label>
      <TextAreaField value={businessUnitOverviewDraft} onValueChange={setBusinessUnitOverviewDraft} ariaLabel="Business unit overview" />
      <label className="agent-chart-field-label" htmlFor="business-unit-objectives">
        Objectives
      </label>
      <TextAreaField value={businessUnitObjectivesDraft} onValueChange={setBusinessUnitObjectivesDraft} ariaLabel="Business unit objectives" />
      <label className="agent-chart-field-label" htmlFor="business-unit-products">
        Primary Products/Services
      </label>
      <TextAreaField
        value={businessUnitProductsDraft}
        onValueChange={setBusinessUnitProductsDraft}
        ariaLabel="Business unit primary products and services"
      />
      <label className="agent-chart-field-label" htmlFor="business-unit-success-metrics">
        Success Metrics
      </label>
      <TextAreaField value={businessUnitMetricsDraft} onValueChange={setBusinessUnitMetricsDraft} ariaLabel="Business unit success metrics" />
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
