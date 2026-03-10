import { ModalShell, ModalTopRail, TextAreaField, TextButton, TextField } from '../../../../../shared/ui';
import { useState } from 'react';
import { ComposeEmailContactsModal } from './ComposeEmailContactsModal';
import './ComposeEmailModal.css';

type ComposeEmailContact = {
  id: string;
  name: string;
  title: string;
  address: string;
  avatarDataUrl?: string;
};

type ComposeEmailModalProps = {
  open: boolean;
  fromLabel: string;
  toValue: string;
  ccValue: string;
  bccValue: string;
  subjectValue: string;
  bodyValue: string;
  sending: boolean;
  onClose: () => void;
  onToChange: (value: string) => void;
  onCcChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSend: () => void;
  contacts: ComposeEmailContact[];
  onInsertTo: (address: string) => void;
};

export function ComposeEmailModal(props: ComposeEmailModalProps) {
  const {
    open,
    fromLabel,
    toValue,
    ccValue,
    bccValue,
    subjectValue,
    bodyValue,
    sending,
    onClose,
    onToChange,
    onCcChange,
    onBccChange,
    onSubjectChange,
    onBodyChange,
    onSend,
    contacts,
    onInsertTo
  } = props;
  const [contactsOpen, setContactsOpen] = useState(false);

  return (
    <>
      <ModalShell open={open} onClose={onClose} size="large" ariaLabel="Compose email">
        <div className="compose-email-modal">
          <ModalTopRail
            left={<h2 className="compose-email-title">Compose Email</h2>}
            right={
              <div className="compose-email-actions">
                <TextButton label="Cancel" variant="secondary" onClick={onClose} />
                <TextButton label={sending ? 'Sending...' : 'Send'} variant="primary" onClick={onSend} />
              </div>
            }
          />
          <div className="compose-email-fields">
            <div className="compose-email-row">
              <span className="compose-email-label">From</span>
              <div className="compose-email-value">{fromLabel}</div>
            </div>
            <div className="compose-email-row">
              <span className="compose-email-label">To</span>
              <div className="compose-email-to-field-wrap">
                <TextField value={toValue} onValueChange={onToChange} ariaLabel="Email recipients" placeholder="name@company.com, ..." />
                <button
                  type="button"
                  className="compose-email-contacts-button"
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
            <div className="compose-email-row">
              <span className="compose-email-label">CC</span>
              <TextField value={ccValue} onValueChange={onCcChange} ariaLabel="Email CC recipients" placeholder="optional" />
            </div>
            <div className="compose-email-row">
              <span className="compose-email-label">BCC</span>
              <TextField value={bccValue} onValueChange={onBccChange} ariaLabel="Email BCC recipients" placeholder="optional" />
            </div>
            <div className="compose-email-row">
              <span className="compose-email-label">Subject</span>
              <TextField value={subjectValue} onValueChange={onSubjectChange} ariaLabel="Email subject" placeholder="Subject" />
            </div>
            <div className="compose-email-body-wrap">
              <TextAreaField
                value={bodyValue}
                onValueChange={onBodyChange}
                ariaLabel="Email body"
                minRows={15}
                placeholder="Write your email..."
              />
            </div>
          </div>
        </div>
      </ModalShell>
      <ComposeEmailContactsModal
        open={contactsOpen}
        contacts={contacts}
        onClose={() => setContactsOpen(false)}
        onSelectAddress={(address) => {
          onInsertTo(address);
          setContactsOpen(false);
        }}
      />
    </>
  );
}

export type { ComposeEmailContact };
