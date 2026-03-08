/**
 * Purpose: Render reusable create/edit modal for core agent manifest fields.
 * Responsibilities:
 * - Support create and edit modes via one shared minimal form.
 * - Keep agent form aligned with V1 operator field set.
 */
// @tags: shared-modules,agents,modal,form
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  createDefaultAgentManifestInput,
  type AgentManifest,
  type AgentManifestInput
} from '../../config/agents';
import {
  AgentAvatar,
  ConfirmDialogModal,
  DropdownSelector,
  ModalShell,
  TextAreaField,
  TextButton,
  TextField,
  type DropdownOption
} from '../../ui';
import { AgentAvatarCropModal } from './AgentAvatarCropModal';
import './AgentManifestModal.css';

type AgentManifestModalProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialAgent?: AgentManifest;
  orgUnitOptions?: DropdownOption[];
  managerOptions?: DropdownOption[];
  defaultOrgUnitId?: string;
  defaultManagerOperatorId?: string | null;
  onSubmit: (
    input: AgentManifestInput,
    placement: { orgUnitId: string; managerOperatorId: string | null }
  ) => void;
  onDelete?: () => void;
};

type RequiredFieldKey = 'name' | 'role' | 'primaryObjective' | 'systemDirectiveShort';

function deriveInitialInput(initialAgent?: AgentManifest): AgentManifestInput {
  if (!initialAgent) {
    return createDefaultAgentManifestInput();
  }

  return {
    avatarSourceDataUrl: initialAgent.avatarSourceDataUrl || initialAgent.avatarDataUrl,
    avatarDataUrl: initialAgent.avatarDataUrl,
    name: initialAgent.name,
    role: initialAgent.role,
    primaryObjective: initialAgent.primaryObjective,
    systemDirectiveShort: initialAgent.systemDirectiveShort,
    toolsPolicyRef: initialAgent.toolsPolicyRef
  };
}

function getMissingRequiredFields(form: AgentManifestInput): RequiredFieldKey[] {
  const missing: RequiredFieldKey[] = [];

  if (!form.name.trim()) {
    missing.push('name');
  }
  if (!form.role.trim()) {
    missing.push('role');
  }
  if (!form.primaryObjective.trim()) {
    missing.push('primaryObjective');
  }
  if (!form.systemDirectiveShort.trim()) {
    missing.push('systemDirectiveShort');
  }

  return missing;
}

function FieldLabel({
  label,
  invalid = false
}: {
  label: string;
  invalid?: boolean;
}) {
  return (
    <span className={`agent-manifest-label-row${invalid ? ' is-invalid' : ''}`}>
      <span className="agent-manifest-label-text">{label}</span>
    </span>
  );
}

export function AgentManifestModal({
  open,
  onClose,
  mode,
  initialAgent,
  orgUnitOptions = [],
  managerOptions = [],
  defaultOrgUnitId = '',
  defaultManagerOperatorId = null,
  onSubmit,
  onDelete
}: AgentManifestModalProps) {
  const [form, setForm] = useState<AgentManifestInput>(() => deriveInitialInput(initialAgent));
  const [cropOpen, setCropOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingAvatarSource, setPendingAvatarSource] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetOrgUnitId, setTargetOrgUnitId] = useState('');
  const [managerOperatorId, setManagerOperatorId] = useState('');

  const missingRequiredFields = useMemo(() => getMissingRequiredFields(form), [form]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(deriveInitialInput(initialAgent));
    setTargetOrgUnitId(defaultOrgUnitId || '');
    setManagerOperatorId(defaultManagerOperatorId || '');
  }, [open, initialAgent, defaultOrgUnitId, defaultManagerOperatorId]);

  const resetForm = () => {
    setForm(deriveInitialInput(initialAgent));
    setCropOpen(false);
    setDeleteConfirmOpen(false);
    setPendingAvatarSource(null);
    setSubmitAttempted(false);
    setTargetOrgUnitId(defaultOrgUnitId || '');
    setManagerOperatorId(defaultManagerOperatorId || '');
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (missingRequiredFields.length > 0) {
      return;
    }
    if ((orgUnitOptions?.length ?? 0) > 0 && !targetOrgUnitId) {
      return;
    }

    onSubmit({
      ...form,
      toolsPolicyRef: form.toolsPolicyRef || 'policy_default'
    }, { orgUnitId: targetOrgUnitId, managerOperatorId: managerOperatorId || null });
    closeModal();
  };

  const handleAvatarPick = () => {
    if (form.avatarSourceDataUrl || form.avatarDataUrl) {
      setPendingAvatarSource(form.avatarSourceDataUrl || form.avatarDataUrl);
      setCropOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextValue = typeof reader.result === 'string' ? reader.result : '';
      if (nextValue) {
        setPendingAvatarSource(nextValue);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);

    event.target.value = '';
  };

  return (
    <ModalShell
      open={open}
      onClose={closeModal}
      size="large"
      title={mode === 'create' ? 'Create Agent' : 'Edit Agent'}
      footer={
        <div className="agent-manifest-footer">
          <p
            className={`agent-manifest-footer-validation${
              submitAttempted && (missingRequiredFields.length > 0 || ((orgUnitOptions?.length ?? 0) > 0 && !targetOrgUnitId))
                ? ' is-visible'
                : ''
            }`}
            role="alert"
          >
            Fill required fields.
          </p>
          <div className="agent-manifest-footer-actions">
            {mode === 'edit' && onDelete ? (
              <TextButton label="Delete Agent" variant="danger" onClick={() => setDeleteConfirmOpen(true)} />
            ) : null}
            <TextButton label="Cancel" variant="ghost" onClick={closeModal} />
            <TextButton
              label={mode === 'create' ? 'Create Agent' : 'Save Changes'}
              variant="primary"
              onClick={handleSubmit}
            />
          </div>
        </div>
      }
    >
      <AgentAvatarCropModal
        open={cropOpen}
        sourceDataUrl={pendingAvatarSource}
        onCancel={() => {
          setCropOpen(false);
          setPendingAvatarSource(null);
        }}
        onReplaceImage={() => {
          setCropOpen(false);
          setPendingAvatarSource(null);
          window.setTimeout(() => {
            fileInputRef.current?.click();
          }, 0);
        }}
        onConfirm={(croppedDataUrl) => {
          setForm((current) => ({
            ...current,
            avatarSourceDataUrl: pendingAvatarSource || current.avatarSourceDataUrl,
            avatarDataUrl: croppedDataUrl
          }));
          setCropOpen(false);
          setPendingAvatarSource(null);
        }}
      />
      <ConfirmDialogModal
        open={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        title="Delete Agent"
        message="This will permanently delete this agent from your workspace."
        confirmLabel="Delete Agent"
        confirmVariant="danger"
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDelete?.();
          closeModal();
        }}
      />

      <div className="agent-manifest-avatar-picker">
        <button type="button" className="agent-manifest-avatar-button" onClick={handleAvatarPick}>
          <AgentAvatar
            name={form.name.trim() ? form.name : 'Agent'}
            src={form.avatarDataUrl || undefined}
            size="xl"
            shape="circle"
          />
          <span>Select Profile Image</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="agent-manifest-avatar-input"
          onChange={handleAvatarChange}
        />
      </div>

      <div className="agent-manifest-modal-grid">
        <label className="agent-manifest-field">
          <FieldLabel label="Name" invalid={submitAttempted && !form.name.trim()} />
          <TextField
            value={form.name}
            ariaLabel="Agent name"
            invalid={submitAttempted && !form.name.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, name: next }))}
          />
        </label>

        <label className="agent-manifest-field">
          <FieldLabel label="Role" invalid={submitAttempted && !form.role.trim()} />
          <TextField
            value={form.role}
            ariaLabel="Agent role"
            invalid={submitAttempted && !form.role.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, role: next }))}
          />
        </label>

        {(orgUnitOptions?.length ?? 0) > 0 ? (
          <label className="agent-manifest-field">
            <FieldLabel label="Org Unit" invalid={submitAttempted && !targetOrgUnitId} />
            <DropdownSelector
              value={targetOrgUnitId}
              ariaLabel="Org unit"
              options={orgUnitOptions ?? []}
              onValueChange={setTargetOrgUnitId}
            />
          </label>
        ) : null}

        {(managerOptions?.length ?? 0) > 0 ? (
          <label className="agent-manifest-field">
            <FieldLabel label="Reports To" />
            <DropdownSelector
              value={managerOperatorId}
              ariaLabel="Reports to"
              options={managerOptions ?? []}
              onValueChange={setManagerOperatorId}
            />
          </label>
        ) : null}

        <label className="agent-manifest-field span-2">
          <FieldLabel label="Primary Objective" invalid={submitAttempted && !form.primaryObjective.trim()} />
          <TextField
            value={form.primaryObjective}
            ariaLabel="Primary objective"
            invalid={submitAttempted && !form.primaryObjective.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, primaryObjective: next }))}
          />
        </label>

        <label className="agent-manifest-field span-2">
          <FieldLabel
            label="System Directive"
            invalid={submitAttempted && !form.systemDirectiveShort.trim()}
          />
          <TextAreaField
            value={form.systemDirectiveShort}
            ariaLabel="System directive"
            invalid={submitAttempted && !form.systemDirectiveShort.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, systemDirectiveShort: next }))}
          />
        </label>
      </div>
    </ModalShell>
  );
}
