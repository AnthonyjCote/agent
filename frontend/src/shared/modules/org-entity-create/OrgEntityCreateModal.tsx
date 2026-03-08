import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ActorKind } from '../../config/org-chart';
import { AgentAvatar, DropdownSelector, InfoTooltip, ModalShell, TextAreaField, TextButton, TextField, type DropdownOption } from '../../ui';
import { AgentAvatarCropModal } from '../agent-manifest';
import './OrgEntityCreateModal.css';

type EntityKind = 'business_unit' | 'org_unit' | 'actor';

type ActorDraft = {
  name: string;
  title: string;
  kind: ActorKind;
  targetOrgUnitId: string;
  primaryObjective: string;
  systemDirective: string;
  roleBrief: string;
  avatarSourceDataUrl: string;
  avatarDataUrl: string;
};

type BusinessUnitDraft = {
  name: string;
  overview: string;
  objectives: string;
  primaryProductsOrServices: string;
  successMetrics: string;
  logoSourceDataUrl: string;
  logoDataUrl: string;
};

type OrgUnitDraft = {
  name: string;
  overview: string;
  coreResponsibilities: string;
  primaryDeliverables: string;
  workingModel: 'human' | 'agent' | 'hybrid';
  iconSourceDataUrl: string;
  iconDataUrl: string;
};

type OrgEntityCreateModalProps = {
  open: boolean;
  entityKind: EntityKind;
  defaultOrgUnitId: string;
  orgUnitOptions: DropdownOption[];
  onClose: () => void;
  onCreateBusinessUnit: (input: BusinessUnitDraft) => void;
  onCreateOrgUnit: (input: OrgUnitDraft) => void;
  onCreateActor: (input: ActorDraft) => boolean | void;
};

function FieldLabel({ label, info }: { label: string; info?: string }) {
  return (
    <span className="org-entity-modal-label-row">
      <span className="org-entity-modal-label-text">{label}</span>
      {info ? <InfoTooltip content={info} /> : null}
    </span>
  );
}

export function OrgEntityCreateModal(props: OrgEntityCreateModalProps) {
  const {
    open,
    entityKind,
    defaultOrgUnitId,
    orgUnitOptions,
    onClose,
    onCreateBusinessUnit,
    onCreateOrgUnit,
    onCreateActor
  } = props;

  const [actor, setActor] = useState<ActorDraft>({
    name: '',
    title: '',
    kind: 'agent',
    targetOrgUnitId: defaultOrgUnitId,
    primaryObjective: '',
    systemDirective: '',
    roleBrief: '',
    avatarSourceDataUrl: '',
    avatarDataUrl: ''
  });
  const [businessUnit, setBusinessUnit] = useState<BusinessUnitDraft>({
    name: '',
    overview: '',
    objectives: '',
    primaryProductsOrServices: '',
    successMetrics: '',
    logoSourceDataUrl: '',
    logoDataUrl: ''
  });
  const [orgUnit, setOrgUnit] = useState<OrgUnitDraft>({
    name: '',
    overview: '',
    coreResponsibilities: '',
    primaryDeliverables: '',
    workingModel: 'hybrid',
    iconSourceDataUrl: '',
    iconDataUrl: ''
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingImageSource, setPendingImageSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const actorKindOptions: DropdownOption[] = [
    { value: 'agent', label: 'Agent' },
    { value: 'human', label: 'Human' }
  ];
  const workingModelOptions: DropdownOption[] = [
    { value: 'human', label: 'Human' },
    { value: 'agent', label: 'Agent' },
    { value: 'hybrid', label: 'Hybrid' }
  ];

  useEffect(() => {
    if (!open) {
      return;
    }
    setActor({
      name: '',
      title: '',
      kind: 'agent',
      targetOrgUnitId: defaultOrgUnitId,
      primaryObjective: '',
      systemDirective: '',
      roleBrief: '',
      avatarSourceDataUrl: '',
      avatarDataUrl: ''
    });
    setBusinessUnit({
      name: '',
      overview: '',
      objectives: '',
      primaryProductsOrServices: '',
      successMetrics: '',
      logoSourceDataUrl: '',
      logoDataUrl: ''
    });
    setOrgUnit({
      name: '',
      overview: '',
      coreResponsibilities: '',
      primaryDeliverables: '',
      workingModel: 'hybrid',
      iconSourceDataUrl: '',
      iconDataUrl: ''
    });
    setSubmitAttempted(false);
    setCropOpen(false);
    setPendingImageSource(null);
  }, [open, defaultOrgUnitId, entityKind]);

  const modalTitle = useMemo(() => {
    if (entityKind === 'business_unit') {
      return 'Create Business Unit';
    }
    if (entityKind === 'org_unit') {
      return 'Create Org Unit';
    }
    return 'Create Operator';
  }, [entityKind]);

  const actorHasOrgOptions = orgUnitOptions.length > 0;
  const actorMissingRequired =
    !actor.name.trim() ||
    !actor.title.trim() ||
    !actor.targetOrgUnitId.trim() ||
    !actor.primaryObjective.trim() ||
    (actor.kind === 'agent' ? !actor.systemDirective.trim() : !actor.roleBrief.trim());
  const businessUnitMissingRequired =
    !businessUnit.name.trim() ||
    !businessUnit.overview.trim() ||
    !businessUnit.objectives.trim() ||
    !businessUnit.primaryProductsOrServices.trim() ||
    !businessUnit.successMetrics.trim();
  const orgUnitMissingRequired =
    !orgUnit.name.trim() ||
    !orgUnit.overview.trim() ||
    !orgUnit.coreResponsibilities.trim() ||
    !orgUnit.primaryDeliverables.trim();

  const entityMissingRequired =
    entityKind === 'actor'
      ? actorMissingRequired
      : entityKind === 'business_unit'
        ? businessUnitMissingRequired
        : orgUnitMissingRequired;

  const pickImage = () => {
    if (entityKind === 'actor' && (actor.avatarSourceDataUrl || actor.avatarDataUrl)) {
      setPendingImageSource(actor.avatarSourceDataUrl || actor.avatarDataUrl);
      setCropOpen(true);
      return;
    }
    if (entityKind === 'business_unit' && (businessUnit.logoSourceDataUrl || businessUnit.logoDataUrl)) {
      setPendingImageSource(businessUnit.logoSourceDataUrl || businessUnit.logoDataUrl);
      setCropOpen(true);
      return;
    }
    if (entityKind === 'org_unit' && (orgUnit.iconSourceDataUrl || orgUnit.iconDataUrl)) {
      setPendingImageSource(orgUnit.iconSourceDataUrl || orgUnit.iconDataUrl);
      setCropOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === 'string' ? reader.result : '';
      if (nextValue) {
        setPendingImageSource(nextValue);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    const sourceDataUrl = pendingImageSource || croppedDataUrl;
    if (entityKind === 'actor') {
      setActor((current) => ({ ...current, avatarSourceDataUrl: sourceDataUrl, avatarDataUrl: croppedDataUrl }));
    } else if (entityKind === 'business_unit') {
      setBusinessUnit((current) => ({ ...current, logoSourceDataUrl: sourceDataUrl, logoDataUrl: croppedDataUrl }));
    } else {
      setOrgUnit((current) => ({ ...current, iconSourceDataUrl: sourceDataUrl, iconDataUrl: croppedDataUrl }));
    }
    setCropOpen(false);
    setPendingImageSource(null);
  };

  const imageName =
    entityKind === 'actor'
      ? actor.name.trim() || 'Operator'
      : entityKind === 'business_unit'
        ? businessUnit.name.trim() || 'Business Unit'
        : orgUnit.name.trim() || 'Org Unit';
  const imageSrc =
    entityKind === 'actor'
      ? actor.avatarDataUrl
      : entityKind === 'business_unit'
        ? businessUnit.logoDataUrl
        : orgUnit.iconDataUrl;

  const handleCreate = () => {
    setSubmitAttempted(true);
    if (entityMissingRequired) {
      return;
    }

    if (entityKind === 'business_unit') {
      onCreateBusinessUnit(businessUnit);
      onClose();
      return;
    }

    if (entityKind === 'org_unit') {
      onCreateOrgUnit(orgUnit);
      onClose();
      return;
    }

    const result = onCreateActor(actor);
    if (result !== false) {
      onClose();
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="large"
      title={modalTitle}
      footer={
        <div className="org-entity-modal-footer">
          <p className={`org-entity-modal-validation${submitAttempted && entityMissingRequired ? ' is-visible' : ''}`} role="alert">
            Fill required fields.
          </p>
          <div className="org-entity-modal-footer-actions">
            <TextButton label="Cancel" variant="ghost" onClick={onClose} />
            <TextButton label="Create" variant="primary" onClick={handleCreate} disabled={entityKind === 'actor' && !actorHasOrgOptions} />
          </div>
        </div>
      }
    >
      <AgentAvatarCropModal
        open={cropOpen}
        sourceDataUrl={pendingImageSource}
        onCancel={() => {
          setCropOpen(false);
          setPendingImageSource(null);
        }}
        onReplaceImage={() => {
          setCropOpen(false);
          setPendingImageSource(null);
          window.setTimeout(() => {
            fileInputRef.current?.click();
          }, 0);
        }}
        onConfirm={handleCropConfirm}
      />

      <div className="org-entity-modal-avatar-picker">
        <button type="button" className="org-entity-modal-avatar-button" onClick={pickImage}>
          <AgentAvatar name={imageName} src={imageSrc || undefined} size="xl" shape="circle" />
          <span>Select Profile Image</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="org-entity-modal-avatar-input" onChange={handleImageChange} />
      </div>

      {entityKind === 'business_unit' ? (
        <div className="org-entity-modal-grid">
          <label className="org-entity-modal-field">
            <FieldLabel label="Name" info="Business unit name." />
            <TextField value={businessUnit.name} ariaLabel="Business unit name" invalid={submitAttempted && !businessUnit.name.trim()} onValueChange={(next) => setBusinessUnit((current) => ({ ...current, name: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Overview" info="What this business unit does." />
            <TextAreaField value={businessUnit.overview} ariaLabel="Business unit overview" invalid={submitAttempted && !businessUnit.overview.trim()} onValueChange={(next) => setBusinessUnit((current) => ({ ...current, overview: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Objectives" info="Top goals for this unit." />
            <TextAreaField value={businessUnit.objectives} ariaLabel="Business unit objectives" invalid={submitAttempted && !businessUnit.objectives.trim()} onValueChange={(next) => setBusinessUnit((current) => ({ ...current, objectives: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Primary Products/Services" info="Main products or services owned by this unit." />
            <TextAreaField value={businessUnit.primaryProductsOrServices} ariaLabel="Business unit products" invalid={submitAttempted && !businessUnit.primaryProductsOrServices.trim()} onValueChange={(next) => setBusinessUnit((current) => ({ ...current, primaryProductsOrServices: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Success Metrics" info="KPIs used to evaluate this unit." />
            <TextAreaField value={businessUnit.successMetrics} ariaLabel="Business unit success metrics" invalid={submitAttempted && !businessUnit.successMetrics.trim()} onValueChange={(next) => setBusinessUnit((current) => ({ ...current, successMetrics: next }))} />
          </label>
        </div>
      ) : null}

      {entityKind === 'org_unit' ? (
        <div className="org-entity-modal-grid">
          <label className="org-entity-modal-field">
            <FieldLabel label="Name" info="Org unit name." />
            <TextField value={orgUnit.name} ariaLabel="Org unit name" invalid={submitAttempted && !orgUnit.name.trim()} onValueChange={(next) => setOrgUnit((current) => ({ ...current, name: next }))} />
          </label>
          <label className="org-entity-modal-field">
            <FieldLabel label="Working Model" info="How this unit operates." />
            <DropdownSelector value={orgUnit.workingModel} ariaLabel="Org unit working model" options={workingModelOptions} onValueChange={(next) => setOrgUnit((current) => ({ ...current, workingModel: next as OrgUnitDraft['workingModel'] }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Overview" info="What this team is responsible for." />
            <TextAreaField value={orgUnit.overview} ariaLabel="Org unit overview" invalid={submitAttempted && !orgUnit.overview.trim()} onValueChange={(next) => setOrgUnit((current) => ({ ...current, overview: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Core Responsibilities" info="Key responsibilities of this org unit." />
            <TextAreaField value={orgUnit.coreResponsibilities} ariaLabel="Org unit core responsibilities" invalid={submitAttempted && !orgUnit.coreResponsibilities.trim()} onValueChange={(next) => setOrgUnit((current) => ({ ...current, coreResponsibilities: next }))} />
          </label>
          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Primary Deliverables" info="Primary outputs this unit ships." />
            <TextAreaField value={orgUnit.primaryDeliverables} ariaLabel="Org unit primary deliverables" invalid={submitAttempted && !orgUnit.primaryDeliverables.trim()} onValueChange={(next) => setOrgUnit((current) => ({ ...current, primaryDeliverables: next }))} />
          </label>
        </div>
      ) : null}

      {entityKind === 'actor' ? (
        <div className="org-entity-modal-grid">
          <label className="org-entity-modal-field">
            <FieldLabel label="Name" info="Operator display name in the org chart." />
            <TextField value={actor.name} ariaLabel="Operator name" invalid={submitAttempted && !actor.name.trim()} onValueChange={(next) => setActor((current) => ({ ...current, name: next }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Title" info="Role title for this operator." />
            <TextField value={actor.title} ariaLabel="Operator title" invalid={submitAttempted && !actor.title.trim()} onValueChange={(next) => setActor((current) => ({ ...current, title: next }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Type" info="Current occupant type for this role." />
            <DropdownSelector value={actor.kind} ariaLabel="Operator type" options={actorKindOptions} onValueChange={(next) => setActor((current) => ({ ...current, kind: next as ActorKind }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Org Unit" info="Team this operator belongs to." />
            <DropdownSelector value={actor.targetOrgUnitId} ariaLabel="Target org unit" options={orgUnitOptions} disabled={!actorHasOrgOptions} onValueChange={(next) => setActor((current) => ({ ...current, targetOrgUnitId: next }))} />
          </label>

          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Primary Objective" info="Top outcome this role is accountable for." />
            <TextField value={actor.primaryObjective} ariaLabel="Primary objective" invalid={submitAttempted && !actor.primaryObjective.trim()} onValueChange={(next) => setActor((current) => ({ ...current, primaryObjective: next }))} />
          </label>

          {actor.kind === 'agent' ? (
            <label className="org-entity-modal-field span-2">
              <FieldLabel label="System Directive" info="Behavior rules for this AI operator." />
              <TextAreaField value={actor.systemDirective} ariaLabel="System directive" invalid={submitAttempted && !actor.systemDirective.trim()} onValueChange={(next) => setActor((current) => ({ ...current, systemDirective: next }))} />
            </label>
          ) : (
            <label className="org-entity-modal-field span-2">
              <FieldLabel label="Role Brief" info="How this human role operates and collaborates with AI support." />
              <TextAreaField value={actor.roleBrief} ariaLabel="Role brief" invalid={submitAttempted && !actor.roleBrief.trim()} onValueChange={(next) => setActor((current) => ({ ...current, roleBrief: next }))} />
            </label>
          )}
        </div>
      ) : null}

      {entityKind === 'actor' && !actorHasOrgOptions ? <p className="org-entity-modal-hint">Create an org unit before adding operators.</p> : null}
    </ModalShell>
  );
}
