/**
 * Purpose: Render reusable create/edit modal for agent manifest fields.
 * Responsibilities:
 * - Support create and edit modes via shared form component.
 * - Keep manifest form reusable across multiple domain pages.
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
  type AgentManifestInput,
  type AgentStylePreset,
  type AuthorityScope
} from '../../config/agents';
import { AgentAvatar, ConfirmDialogModal, DropdownSelector, InfoTooltip, TextAreaField, TextButton, TextField, ModalShell } from '../../ui';
import { AgentAvatarCropModal } from './AgentAvatarCropModal';
import './AgentManifestModal.css';

type AgentManifestModalProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialAgent?: AgentManifest;
  onSubmit: (input: AgentManifestInput) => void;
  onDelete?: () => void;
};

type RequiredFieldKey = 'name' | 'role' | 'primaryObjective' | 'systemDirectiveShort';

function splitTags(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinTags(items: string[]): string {
  return items.join(', ');
}

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
    stylePreset: initialAgent.stylePreset,
    toolsPolicyRef: initialAgent.toolsPolicyRef,
    memoryProfileRef: initialAgent.memoryProfileRef,
    deterministic: {
      authorityScope: initialAgent.deterministic.authorityScope,
      kpiTargets: [...initialAgent.deterministic.kpiTargets],
      sopRefs: [...initialAgent.deterministic.sopRefs],
      sopSummary: initialAgent.deterministic.sopSummary
    },
    optionalContext: { ...initialAgent.optionalContext }
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

function FieldLabel({ label, info, invalid = false }: { label: string; info: string; invalid?: boolean }) {
  return (
    <span className={`agent-manifest-label-row${invalid ? ' is-invalid' : ''}`}>
      <span className="agent-manifest-label-text">{label}</span>
      <InfoTooltip content={info} />
    </span>
  );
}

export function AgentManifestModal({ open, onClose, mode, initialAgent, onSubmit, onDelete }: AgentManifestModalProps) {
  const [form, setForm] = useState<AgentManifestInput>(() => deriveInitialInput(initialAgent));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingAvatarSource, setPendingAvatarSource] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const kpiTargetsText = useMemo(() => joinTags(form.deterministic.kpiTargets), [form.deterministic.kpiTargets]);
  const sopRefsText = useMemo(() => joinTags(form.deterministic.sopRefs), [form.deterministic.sopRefs]);
  const missingRequiredFields = useMemo(() => getMissingRequiredFields(form), [form]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(deriveInitialInput(initialAgent));
  }, [open, initialAgent]);

  const resetForm = () => {
    setForm(deriveInitialInput(initialAgent));
    setShowAdvanced(false);
    setCropOpen(false);
    setDeleteConfirmOpen(false);
    setPendingAvatarSource(null);
    setSubmitAttempted(false);
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

    const hasOptionalContext = [
      form.optionalContext.decisionAuthorityNotes,
      form.optionalContext.kpiPriorityNotes,
      form.optionalContext.constraintNotes,
      form.optionalContext.escalationNotes,
      form.optionalContext.organizationContext,
      form.optionalContext.communicationContract,
      form.optionalContext.personalityProfile,
      form.optionalContext.biography,
      form.optionalContext.jobDescriptionLong
    ].some((value) => value.trim().length > 0);

    onSubmit({
      ...form,
      optionalContext: {
        ...form.optionalContext,
        enabled: hasOptionalContext
      }
    });
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
          <p className={`agent-manifest-footer-validation${submitAttempted && missingRequiredFields.length > 0 ? ' is-visible' : ''}`} role="alert">
            Fill required fields.
          </p>
          <div className="agent-manifest-footer-actions">
            {mode === 'edit' && onDelete ? (
              <TextButton label="Delete Agent" variant="danger" onClick={() => setDeleteConfirmOpen(true)} />
            ) : null}
            <TextButton label="Cancel" variant="ghost" onClick={closeModal} />
            <TextButton label={mode === 'create' ? 'Create Agent' : 'Save Changes'} variant="primary" onClick={handleSubmit} />
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
          <FieldLabel
            label="Name"
            info="Public display name for this agent in the deck, charts, and routing views."
            invalid={submitAttempted && !form.name.trim()}
          />
          <TextField
            value={form.name}
            ariaLabel="Agent name"
            invalid={submitAttempted && !form.name.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, name: next }))}
          />
        </label>

        <label className="agent-manifest-field">
          <FieldLabel
            label="Role"
            info="The job this agent performs. Keep it specific so routing and behavior stay clear."
            invalid={submitAttempted && !form.role.trim()}
          />
          <TextField
            value={form.role}
            ariaLabel="Agent role"
            invalid={submitAttempted && !form.role.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, role: next }))}
          />
        </label>

        <label className="agent-manifest-field span-2">
          <FieldLabel
            label="Primary Objective"
            info="Main outcome this agent is accountable for. This should be the single top priority."
            invalid={submitAttempted && !form.primaryObjective.trim()}
          />
          <TextField
            value={form.primaryObjective}
            ariaLabel="Primary objective"
            invalid={submitAttempted && !form.primaryObjective.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, primaryObjective: next }))}
          />
        </label>

        <label className="agent-manifest-field span-2">
          <FieldLabel
            label="System Directive (Short)"
            info="Core behavior rules this agent should always follow across all tasks."
            invalid={submitAttempted && !form.systemDirectiveShort.trim()}
          />
          <TextAreaField
            value={form.systemDirectiveShort}
            ariaLabel="System directive"
            invalid={submitAttempted && !form.systemDirectiveShort.trim()}
            onValueChange={(next) => setForm((f) => ({ ...f, systemDirectiveShort: next }))}
          />
        </label>

        <button
          type="button"
          className="agent-manifest-accordion-button span-2"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? 'Hide Optional Fields' : 'Show Optional Fields'}
        </button>

        {showAdvanced ? (
          <div className="agent-manifest-advanced span-2">
            <p className="agent-manifest-optional-notice">
              Adding optional context can improve role fidelity but increases token usage, latency, and cost.
            </p>

            <label className="agent-manifest-field">
              <FieldLabel
                label="Style Preset"
                info="Preferred communication style for responses and collaboration tone."
              />
              <DropdownSelector
                value={form.stylePreset}
                ariaLabel="Style preset"
                onValueChange={(next) => setForm((f) => ({ ...f, stylePreset: next as AgentStylePreset }))}
                options={[
                  { value: 'direct', label: 'Direct' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'collaborative', label: 'Collaborative' }
                ]}
              />
            </label>

            <label className="agent-manifest-field">
              <FieldLabel
                label="Authority Scope"
                info="How much this agent can decide and execute independently before escalation."
              />
              <DropdownSelector
                value={form.deterministic.authorityScope}
                ariaLabel="Authority scope"
                onValueChange={(next) =>
                  setForm((f) => ({
                    ...f,
                    deterministic: { ...f.deterministic, authorityScope: next as AuthorityScope }
                  }))
                }
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' }
                ]}
              />
            </label>

            <label className="agent-manifest-field span-2">
              <FieldLabel
                label="KPI Targets (comma-separated)"
                info="Metrics this agent is measured against. Use metric names or identifiers."
              />
              <TextField
                value={kpiTargetsText}
                ariaLabel="KPI targets"
                onValueChange={(next) =>
                  setForm((f) => ({ ...f, deterministic: { ...f.deterministic, kpiTargets: splitTags(next) } }))
                }
              />
            </label>

            <label className="agent-manifest-field span-2">
              <FieldLabel
                label="SOP References (comma-separated)"
                info="Reference IDs/names for operating procedures this agent should follow."
              />
              <TextField
                value={sopRefsText}
                ariaLabel="SOP references"
                onValueChange={(next) =>
                  setForm((f) => ({ ...f, deterministic: { ...f.deterministic, sopRefs: splitTags(next) } }))
                }
              />
            </label>

            <label className="agent-manifest-field span-2">
              <FieldLabel
                label="SOP Summary"
                info="Short plain-language summary of procedure expectations when SOP links are insufficient."
              />
              <TextAreaField
                value={form.deterministic.sopSummary}
                ariaLabel="SOP summary"
                onValueChange={(next) =>
                  setForm((f) => ({ ...f, deterministic: { ...f.deterministic, sopSummary: next } }))
                }
              />
            </label>

            <label className="agent-manifest-field span-2">
              <FieldLabel
                label="Decision Authority Notes"
                info="Explicitly document what this agent can approve or decide without human sign-off."
              />
              <TextAreaField
                value={form.optionalContext.decisionAuthorityNotes}
                ariaLabel="Decision authority notes"
                onValueChange={(next) =>
                  setForm((f) => ({
                    ...f,
                    optionalContext: { ...f.optionalContext, decisionAuthorityNotes: next }
                  }))
                }
              />
            </label>

            <label className="agent-manifest-field span-2">
              <FieldLabel
                label="Organization Context"
                info="Explain where this role sits in your organization and which teams it collaborates with."
              />
              <TextAreaField
                value={form.optionalContext.organizationContext}
                ariaLabel="Organization context"
                onValueChange={(next) =>
                  setForm((f) => ({
                    ...f,
                    optionalContext: { ...f.optionalContext, organizationContext: next }
                  }))
                }
              />
            </label>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
