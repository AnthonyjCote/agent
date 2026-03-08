import { AgentAvatar, DropdownSelector, TextAreaField, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';
import type { Actor } from '../../../../shared/config';

type ActorDetailsCardProps = {
  actor: Actor;
  actorNameDraft: string;
  actorTitleDraft: string;
  actorPrimaryObjectiveDraft: string;
  actorSystemDirectiveDraft: string;
  actorRoleBriefDraft: string;
  setActorNameDraft: (next: string) => void;
  setActorTitleDraft: (next: string) => void;
  setActorPrimaryObjectiveDraft: (next: string) => void;
  setActorSystemDirectiveDraft: (next: string) => void;
  setActorRoleBriefDraft: (next: string) => void;
  actorTypeOptions: DropdownOption[];
  orgOptions: DropdownOption[];
  managerOptions: DropdownOption[];
  onChangeKind: (value: string) => void;
  onChangeOrgUnit: (value: string) => void;
  onChangeManager: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onPickMedia: () => void;
};

export function ActorDetailsCard(props: ActorDetailsCardProps) {
  const {
    actor,
    actorNameDraft,
    actorTitleDraft,
    actorPrimaryObjectiveDraft,
    actorSystemDirectiveDraft,
    actorRoleBriefDraft,
    setActorNameDraft,
    setActorTitleDraft,
    setActorPrimaryObjectiveDraft,
    setActorSystemDirectiveDraft,
    setActorRoleBriefDraft,
    actorTypeOptions,
    orgOptions,
    managerOptions,
    onChangeKind,
    onChangeOrgUnit,
    onChangeManager,
    onSave,
    onDelete,
    onPickMedia
  } = props;

  return (
    <div className="agent-chart-details-card">
      <h2>Operator</h2>
      <button type="button" className="agent-chart-avatar-button" onClick={onPickMedia}>
        <AgentAvatar name={actor.name || 'Operator'} src={actor.avatarDataUrl || undefined} size="xl" shape="circle" />
        <span>Select Profile Image</span>
      </button>

      <label className="agent-chart-field-label" htmlFor="actor-name">
        Name
      </label>
      <TextField value={actorNameDraft} onValueChange={setActorNameDraft} ariaLabel="Operator name" placeholder="Name" />

      <label className="agent-chart-field-label" htmlFor="actor-title">
        Title
      </label>
      <TextField value={actorTitleDraft} onValueChange={setActorTitleDraft} ariaLabel="Operator title" placeholder="Title" />

      <label className="agent-chart-field-label" htmlFor="actor-kind">
        Type
      </label>
      <DropdownSelector value={actor.kind} options={actorTypeOptions} onValueChange={onChangeKind} ariaLabel="Operator type" />

      <label className="agent-chart-field-label" htmlFor="actor-org-unit">
        Org Unit
      </label>
      <DropdownSelector value={actor.orgUnitId} options={orgOptions} onValueChange={onChangeOrgUnit} ariaLabel="Operator org unit" />

      <label className="agent-chart-field-label" htmlFor="actor-primary-objective">
        Primary Objective
      </label>
      <TextField value={actorPrimaryObjectiveDraft} onValueChange={setActorPrimaryObjectiveDraft} ariaLabel="Operator primary objective" />

      {actor.kind === 'agent' ? (
        <>
          <label className="agent-chart-field-label" htmlFor="actor-system-directive">
            System Directive
          </label>
          <TextAreaField value={actorSystemDirectiveDraft} onValueChange={setActorSystemDirectiveDraft} ariaLabel="Operator system directive" />
        </>
      ) : (
        <>
          <label className="agent-chart-field-label" htmlFor="actor-role-brief">
            Role Brief
          </label>
          <TextAreaField value={actorRoleBriefDraft} onValueChange={setActorRoleBriefDraft} ariaLabel="Operator role brief" />
        </>
      )}

      <label className="agent-chart-field-label" htmlFor="actor-manager">
        Reports To
      </label>
      <DropdownSelector value={actor.managerActorId ?? ''} options={managerOptions} onValueChange={onChangeManager} ariaLabel="Operator manager" />

      <div className="agent-chart-details-actions">
        <TextButton label="Delete" variant="danger" onClick={onDelete} />
        <TextButton label="Save" variant="primary" onClick={onSave} />
      </div>
    </div>
  );
}
