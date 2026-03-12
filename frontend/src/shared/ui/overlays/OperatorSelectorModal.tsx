import { useMemo } from 'react';
import { useAgentManifestStore, useOrgChartStore } from '../../config';
import { AgentAvatar } from '../avatar';
import { resolveAvatarSrc } from '../avatar/resolveAvatarSrc';
import { ModalShell, type ModalSize } from './ModalShell';
import './OperatorSelectorModal.css';

export type OperatorSelectorOption = {
  id: string;
  name: string;
  title: string;
  avatarDataUrl?: string;
};

type OperatorSelectorModalProps = {
  open: boolean;
  options: OperatorSelectorOption[];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  title?: string;
  description?: string;
  ariaLabel?: string;
  size?: ModalSize;
};

export function OperatorSelectorModal({
  open,
  options,
  selectedId,
  onClose,
  onSelect,
  title = 'Select Active Account',
  description = 'Choose which operator account is active.',
  ariaLabel = 'Select active operator account',
  size = 'medium'
}: OperatorSelectorModalProps) {
  const { operators } = useOrgChartStore();
  const { agents } = useAgentManifestStore();
  const optionsWithResolvedAvatars = useMemo(
    () =>
      options.map((option) => ({
        ...option,
        resolvedAvatarDataUrl: resolveAvatarSrc({
          explicitAvatarSrc: option.avatarDataUrl,
          operatorId: option.id,
          name: option.name,
          operators,
          manifests: agents
        })
      })),
    [agents, operators, options]
  );

  return (
    <ModalShell open={open} onClose={onClose} size={size} ariaLabel={ariaLabel}>
      <section className="operator-selector-modal">
        <header className="operator-selector-modal-header">
          <h2>{title}</h2>
          <p>{description}</p>
        </header>
        <div className="operator-selector-modal-list">
          {optionsWithResolvedAvatars.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`operator-selector-modal-item ${selectedId === option.id ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(option.id);
                onClose();
              }}
            >
              <AgentAvatar name={option.name} src={option.resolvedAvatarDataUrl} size="sm" />
              <div className="operator-selector-modal-item-copy">
                <strong>{option.name}</strong>
                <span>{option.title}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </ModalShell>
  );
}
