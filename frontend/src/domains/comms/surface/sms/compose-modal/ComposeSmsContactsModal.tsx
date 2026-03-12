import { AgentAvatar, ModalShell } from '@/shared/ui';
import type { ComposeSmsContact } from './ComposeSmsModal';
import './ComposeSmsContactsModal.css';

type ComposeSmsContactsModalProps = {
  open: boolean;
  contacts: ComposeSmsContact[];
  onClose: () => void;
  onSelectContact: (contact: ComposeSmsContact) => void;
};

export function ComposeSmsContactsModal({ open, contacts, onClose, onSelectContact }: ComposeSmsContactsModalProps) {
  return (
    <ModalShell open={open} onClose={onClose} size="medium" ariaLabel="Pick SMS contact">
      <section className="compose-sms-contacts-modal">
        <header className="compose-sms-contacts-header">
          <h2>Contacts</h2>
          <p>Select an operator phone number for the To field.</p>
        </header>
        <div className="compose-sms-contacts-list">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="compose-sms-contact-item"
              onClick={() => onSelectContact(contact)}
            >
              <AgentAvatar name={contact.name} src={contact.avatarDataUrl} size="sm" />
              <div className="compose-sms-contact-copy">
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
