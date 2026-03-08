import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { OperatorKind } from '../../config/org-chart';
import { AgentAvatar, DropdownSelector, InfoTooltip, ModalShell, TextAreaField, TextButton, TextField, type DropdownOption } from '../../ui';
import { AgentAvatarCropModal } from '../agent-manifest';
import './OrgEntityCreateModal.css';

type EntityKind = 'business_unit' | 'org_unit' | 'operator';

type ActorDraft = {
  name: string;
  title: string;
  kind: OperatorKind;
  targetOrgUnitId: string;
  managerOperatorId: string;
  primaryObjective: string;
  systemDirective: string;
  roleBrief: string;
  avatarSourceDataUrl: string;
  avatarDataUrl: string;
};

type BusinessUnitDraft = {
  name: string;
  shortDescription: string;
  logoSourceDataUrl: string;
  logoDataUrl: string;
};

type OrgUnitDraft = {
  name: string;
  shortDescription: string;
  iconSourceDataUrl: string;
  iconDataUrl: string;
};

type OrgEntityCreateModalProps = {
  open: boolean;
  entityKind: EntityKind;
  defaultOrgUnitId: string;
  orgUnitOptions: DropdownOption[];
  managerOptions: DropdownOption[];
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

function NameAndShortDescriptionFields(props: {
  nameLabel: string;
  nameInfo: string;
  nameValue: string;
  nameAriaLabel: string;
  nameInvalid: boolean;
  onNameChange: (next: string) => void;
  descriptionInfo: string;
  descriptionValue: string;
  descriptionAriaLabel: string;
  descriptionInvalid: boolean;
  onDescriptionChange: (next: string) => void;
}) {
  const {
    nameLabel,
    nameInfo,
    nameValue,
    nameAriaLabel,
    nameInvalid,
    onNameChange,
    descriptionInfo,
    descriptionValue,
    descriptionAriaLabel,
    descriptionInvalid,
    onDescriptionChange
  } = props;

  return (
    <div className="org-entity-modal-grid">
      <label className="org-entity-modal-field">
        <FieldLabel label={nameLabel} info={nameInfo} />
        <TextField value={nameValue} ariaLabel={nameAriaLabel} invalid={nameInvalid} onValueChange={onNameChange} />
      </label>
      <label className="org-entity-modal-field span-2">
        <FieldLabel label="Short Description" info={descriptionInfo} />
        <TextAreaField
          value={descriptionValue}
          ariaLabel={descriptionAriaLabel}
          invalid={descriptionInvalid}
          onValueChange={onDescriptionChange}
        />
      </label>
    </div>
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
    onCreateActor,
    managerOptions
  } = props;

  const [operator, setActor] = useState<ActorDraft>({
    name: '',
    title: '',
    kind: 'agent',
    targetOrgUnitId: defaultOrgUnitId,
    managerOperatorId: '',
    primaryObjective: '',
    systemDirective: '',
    roleBrief: '',
    avatarSourceDataUrl: '',
    avatarDataUrl: ''
  });
  const [businessUnit, setBusinessUnit] = useState<BusinessUnitDraft>({
    name: '',
    shortDescription: '',
    logoSourceDataUrl: '',
    logoDataUrl: ''
  });
  const [orgUnit, setOrgUnit] = useState<OrgUnitDraft>({
    name: '',
    shortDescription: '',
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
  useEffect(() => {
    if (!open) {
      return;
    }
    setActor({
      name: '',
      title: '',
      kind: 'agent',
      targetOrgUnitId: defaultOrgUnitId,
      managerOperatorId: '',
      primaryObjective: '',
      systemDirective: '',
      roleBrief: '',
      avatarSourceDataUrl: '',
      avatarDataUrl: ''
    });
    setBusinessUnit({
      name: '',
      shortDescription: '',
      logoSourceDataUrl: '',
      logoDataUrl: ''
    });
    setOrgUnit({
      name: '',
      shortDescription: '',
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
    !operator.name.trim() ||
    !operator.title.trim() ||
    !operator.targetOrgUnitId.trim() ||
    !operator.primaryObjective.trim() ||
    (operator.kind === 'agent' ? !operator.systemDirective.trim() : !operator.roleBrief.trim());
  const businessUnitMissingRequired =
    !businessUnit.name.trim() ||
    !businessUnit.shortDescription.trim();
  const orgUnitMissingRequired =
    !orgUnit.name.trim() ||
    !orgUnit.shortDescription.trim();

  const entityMissingRequired =
    entityKind === 'operator'
      ? actorMissingRequired
      : entityKind === 'business_unit'
        ? businessUnitMissingRequired
        : orgUnitMissingRequired;

  const pickImage = () => {
    if (entityKind === 'operator' && (operator.avatarSourceDataUrl || operator.avatarDataUrl)) {
      setPendingImageSource(operator.avatarSourceDataUrl || operator.avatarDataUrl);
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
    if (entityKind === 'operator') {
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
    entityKind === 'operator'
      ? operator.name.trim() || 'Operator'
      : entityKind === 'business_unit'
        ? businessUnit.name.trim() || 'Business Unit'
        : orgUnit.name.trim() || 'Org Unit';
  const imageSrc =
    entityKind === 'operator'
      ? operator.avatarDataUrl
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

    const result = onCreateActor(operator);
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
            <TextButton label="Create" variant="primary" onClick={handleCreate} disabled={entityKind === 'operator' && !actorHasOrgOptions} />
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
        <NameAndShortDescriptionFields
          nameLabel="Name"
          nameInfo="Business unit name."
          nameValue={businessUnit.name}
          nameAriaLabel="Business unit name"
          nameInvalid={submitAttempted && !businessUnit.name.trim()}
          onNameChange={(next) => setBusinessUnit((current) => ({ ...current, name: next }))}
          descriptionInfo="What this business unit does."
          descriptionValue={businessUnit.shortDescription}
          descriptionAriaLabel="Business unit short description"
          descriptionInvalid={submitAttempted && !businessUnit.shortDescription.trim()}
          onDescriptionChange={(next) => setBusinessUnit((current) => ({ ...current, shortDescription: next }))}
        />
      ) : null}

      {entityKind === 'org_unit' ? (
        <NameAndShortDescriptionFields
          nameLabel="Name"
          nameInfo="Org unit name."
          nameValue={orgUnit.name}
          nameAriaLabel="Org unit name"
          nameInvalid={submitAttempted && !orgUnit.name.trim()}
          onNameChange={(next) => setOrgUnit((current) => ({ ...current, name: next }))}
          descriptionInfo="What this team is responsible for."
          descriptionValue={orgUnit.shortDescription}
          descriptionAriaLabel="Org unit short description"
          descriptionInvalid={submitAttempted && !orgUnit.shortDescription.trim()}
          onDescriptionChange={(next) => setOrgUnit((current) => ({ ...current, shortDescription: next }))}
        />
      ) : null}

      {entityKind === 'operator' ? (
        <div className="org-entity-modal-grid">
          <label className="org-entity-modal-field">
            <FieldLabel label="Name" info="Operator display name in the org chart." />
            <TextField value={operator.name} ariaLabel="Operator name" invalid={submitAttempted && !operator.name.trim()} onValueChange={(next) => setActor((current) => ({ ...current, name: next }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Title" info="Role title for this operator." />
            <TextField value={operator.title} ariaLabel="Operator title" invalid={submitAttempted && !operator.title.trim()} onValueChange={(next) => setActor((current) => ({ ...current, title: next }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Type" info="Current occupant type for this role." />
            <DropdownSelector value={operator.kind} ariaLabel="Operator type" options={actorKindOptions} onValueChange={(next) => setActor((current) => ({ ...current, kind: next as OperatorKind }))} />
          </label>

          <label className="org-entity-modal-field">
            <FieldLabel label="Org Unit" info="Team this operator belongs to." />
            <DropdownSelector value={operator.targetOrgUnitId} ariaLabel="Target org unit" options={orgUnitOptions} disabled={!actorHasOrgOptions} onValueChange={(next) => setActor((current) => ({ ...current, targetOrgUnitId: next }))} />
          </label>
          <label className="org-entity-modal-field">
            <FieldLabel label="Reports To" info="Direct manager for this operator." />
            <DropdownSelector
              value={operator.managerOperatorId}
              ariaLabel="Reports to"
              options={managerOptions}
              onValueChange={(next) => setActor((current) => ({ ...current, managerOperatorId: next }))}
            />
          </label>

          <label className="org-entity-modal-field span-2">
            <FieldLabel label="Primary Objective" info="Top outcome this role is accountable for." />
            <TextField value={operator.primaryObjective} ariaLabel="Primary objective" invalid={submitAttempted && !operator.primaryObjective.trim()} onValueChange={(next) => setActor((current) => ({ ...current, primaryObjective: next }))} />
          </label>

          {operator.kind === 'agent' ? (
            <label className="org-entity-modal-field span-2">
              <FieldLabel label="System Directive" info="Behavior rules for this AI operator." />
              <TextAreaField value={operator.systemDirective} ariaLabel="System directive" invalid={submitAttempted && !operator.systemDirective.trim()} onValueChange={(next) => setActor((current) => ({ ...current, systemDirective: next }))} />
            </label>
          ) : (
            <label className="org-entity-modal-field span-2">
              <FieldLabel label="Role Brief" info="How this human role operates and collaborates with AI support." />
              <TextAreaField value={operator.roleBrief} ariaLabel="Role brief" invalid={submitAttempted && !operator.roleBrief.trim()} onValueChange={(next) => setActor((current) => ({ ...current, roleBrief: next }))} />
            </label>
          )}
        </div>
      ) : null}

      {entityKind === 'operator' && !actorHasOrgOptions ? <p className="org-entity-modal-hint">Create an org unit before adding operators.</p> : null}
    </ModalShell>
  );
}
