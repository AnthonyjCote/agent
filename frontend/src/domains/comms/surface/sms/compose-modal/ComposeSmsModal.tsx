import { useState } from 'react';
import { ModalShell, ModalTopRail, TextAreaField, TextButton, TextField } from '@/shared/ui';
import { ComposeSmsContactsModal } from './ComposeSmsContactsModal';
import './ComposeSmsModal.css';

export type ComposeSmsContact = {
  id: string;
  name: string;
  title: string;
  address: string;
  avatarDataUrl?: string;
};

type ComposeSmsModalProps = {
  open: boolean;
  fromLabel: string;
  toValue: string;
  bodyValue: string;
  sending: boolean;
  contacts: ComposeSmsContact[];
  onClose: () => void;
  onToChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onInsertTo: (contact: ComposeSmsContact) => void;
};

export function ComposeSmsModal({
  open,
  fromLabel,
  toValue,
  bodyValue,
  sending,
  contacts,
  onClose,
  onToChange,
  onBodyChange,
  onSend,
  onInsertTo
}: ComposeSmsModalProps) {
  const [contactsOpen, setContactsOpen] = useState(false);

  return (
    <>
      <ModalShell open={open} onClose={onClose} size="medium" ariaLabel="Compose SMS">
        <div className="compose-sms-modal">
          <ModalTopRail
            left={<h2 className="compose-sms-title">New SMS</h2>}
            right={
              <div className="compose-sms-actions">
                <TextButton label="Cancel" variant="secondary" onClick={onClose} />
                <TextButton label={sending ? 'Sending...' : 'Send'} variant="primary" onClick={onSend} />
              </div>
            }
          />
          <div className="compose-sms-fields">
            <div className="compose-sms-row">
              <span className="compose-sms-label">From</span>
              <div className="compose-sms-value">{fromLabel}</div>
            </div>
            <div className="compose-sms-row">
              <span className="compose-sms-label">To</span>
              <div className="compose-sms-to-field-wrap">
                <TextField value={toValue} onValueChange={onToChange} ariaLabel="SMS recipient" placeholder="+1555XXXXXXX" />
                <button
                  type="button"
                  className="compose-sms-contacts-button"
                  aria-label="Pick contacts"
                  onClick={() => setContactsOpen(true)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="7.5" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M3.8 14.6c.6-1.9 2-3 3.7-3s3.1 1.1 3.7 3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="14.5" cy="8.1" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M12.3 13.8c.4-1.2 1.3-1.9 2.2-1.9.9 0 1.8.7 2.2 1.9" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="compose-sms-body-wrap">
              <TextAreaField
                value={bodyValue}
                onValueChange={onBodyChange}
                ariaLabel="SMS body"
                minRows={6}
                placeholder="Write your message..."
              />
            </div>
          </div>
        </div>
      </ModalShell>
      <ComposeSmsContactsModal
        open={contactsOpen}
        contacts={contacts}
        onClose={() => setContactsOpen(false)}
        onSelectContact={(contact) => {
          onInsertTo(contact);
          setContactsOpen(false);
        }}
      />
    </>
  );
}
