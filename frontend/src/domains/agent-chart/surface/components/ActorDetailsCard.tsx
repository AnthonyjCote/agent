import { DropdownSelector, TextButton, TextField, type DropdownOption } from '../../../../shared/ui';
import type { Actor } from '../../../../shared/config';
import { NodeMedia, NodeMediaIcon } from './NodeMedia';

type ActorDetailsCardProps = {
  actor: Actor;
  actorNameDraft: string;
  actorTitleDraft: string;
  setActorNameDraft: (next: string) => void;
  setActorTitleDraft: (next: string) => void;
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
    setActorNameDraft,
    setActorTitleDraft,
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
      <h2>Actor</h2>
      <button type="button" className="agent-chart-media-picker" onClick={onPickMedia}>
        <NodeMedia image={actor.avatarDataUrl} className="actor details" fallback={<NodeMediaIcon kind="actor" actorKind={actor.kind} />} />
        <span>{actor.avatarDataUrl ? 'Edit Profile Image' : 'Select Profile Image'}</span>
      </button>

      <label className="agent-chart-field-label" htmlFor="actor-name">
        Name
      </label>
      <TextField value={actorNameDraft} onValueChange={setActorNameDraft} ariaLabel="Actor name" placeholder="Name" />

      <label className="agent-chart-field-label" htmlFor="actor-title">
        Title
      </label>
      <TextField value={actorTitleDraft} onValueChange={setActorTitleDraft} ariaLabel="Actor title" placeholder="Title" />

      <label className="agent-chart-field-label" htmlFor="actor-kind">
        Type
      </label>
      <DropdownSelector value={actor.kind} options={actorTypeOptions} onValueChange={onChangeKind} ariaLabel="Actor type" />

      <label className="agent-chart-field-label" htmlFor="actor-org-unit">
        Org Unit
      </label>
      <DropdownSelector value={actor.orgUnitId} options={orgOptions} onValueChange={onChangeOrgUnit} ariaLabel="Actor org unit" />

      <label className="agent-chart-field-label" htmlFor="actor-manager">
        Reports To
      </label>
      <DropdownSelector value={actor.managerActorId ?? ''} options={managerOptions} onValueChange={onChangeManager} ariaLabel="Actor manager" />

      <div className="agent-chart-details-actions">
        <TextButton label="Delete" variant="danger" onClick={onDelete} />
        <TextButton label="Save" variant="primary" onClick={onSave} />
      </div>
    </div>
  );
}

