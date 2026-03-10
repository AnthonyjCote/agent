import { AgentAvatar, ModalShell } from '../../../../../shared/ui';
import './CommsAccountSelectorModal.css';

export type CommsOperatorOption = {
  id: string;
  name: string;
  title: string;
  avatarDataUrl?: string;
};

type CommsAccountSelectorModalProps = {
  open: boolean;
  operators: CommsOperatorOption[];
  selectedOperatorId: string | null;
  onClose: () => void;
  onSelect: (operatorId: string) => void;
};

export function CommsAccountSelectorModal({
  open,
  operators,
  selectedOperatorId,
  onClose,
  onSelect
}: CommsAccountSelectorModalProps) {
  return (
    <ModalShell open={open} onClose={onClose} size="medium" ariaLabel="Select active comms account">
      <section className="comms-account-selector">
        <header className="comms-account-selector-header">
          <h2>Select Active Account</h2>
          <p>Choose which operator account is active across Email, Chat, and SMS.</p>
        </header>
        <div className="comms-account-selector-list">
          {operators.map((operator) => (
            <button
              key={operator.id}
              type="button"
              className={`comms-account-selector-item ${selectedOperatorId === operator.id ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(operator.id);
                onClose();
              }}
            >
              <AgentAvatar name={operator.name} src={operator.avatarDataUrl} size="sm" />
              <div className="comms-account-selector-item-copy">
                <strong>{operator.name}</strong>
                <span>{operator.title}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </ModalShell>
  );
}
