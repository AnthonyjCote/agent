import { AgentAvatar, ModalShell } from '../../../../../shared/ui';
import type { ComposeEmailContact } from './ComposeEmailModal';
import './ComposeEmailContactsModal.css';

type ComposeEmailContactsModalProps = {
  open: boolean;
  contacts: ComposeEmailContact[];
  onClose: () => void;
  onSelectAddress: (address: string) => void;
};

export function ComposeEmailContactsModal({ open, contacts, onClose, onSelectAddress }: ComposeEmailContactsModalProps) {
  return (
    <ModalShell open={open} onClose={onClose} size="medium" ariaLabel="Pick email contact">
      <section className="compose-email-contacts-modal">
        <header className="compose-email-contacts-header">
          <h2>Contacts</h2>
          <p>Select an operator to insert in the To field.</p>
        </header>
        <div className="compose-email-contacts-list">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="compose-email-contact-item"
              onClick={() => onSelectAddress(contact.address)}
            >
              <AgentAvatar name={contact.name} src={contact.avatarDataUrl} size="sm" />
              <div className="compose-email-contact-copy">
                <strong>{contact.name}</strong>
                <span>{contact.title}</span>
                <em>{contact.address}</em>
              </div>
            </button>
          ))}
        </div>
      </section>
    </ModalShell>
  );
}
