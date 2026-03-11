import type { CommsMessageRecord, CommsThreadRecord } from '@agent-deck/runtime-client';
import { ModalShell, ModalTopRail, TextButton } from '../../../../../shared/ui';
import { formatCommsTime } from '../../../model';
import './ReadEmailModal.css';

type ReadEmailModalProps = {
  open: boolean;
  thread: CommsThreadRecord | null;
  messages: CommsMessageRecord[];
  folder: string;
  isRead: boolean;
  onClose: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
};

function participantsToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object' && 'email' in item && typeof (item as { email?: unknown }).email === 'string') {
          return (item as { email: string }).email;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

export function ReadEmailModal({
  open,
  thread,
  messages,
  folder,
  isRead,
  onClose,
  onReply,
  onForward,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread
}: ReadEmailModalProps) {
  const latest = messages[messages.length - 1] ?? null;
  const fromText = latest?.fromAccountRef || '(unknown sender)';
  const toText = participantsToText(latest?.toParticipants) || '(unknown recipient)';
  const ccText = participantsToText(latest?.ccParticipants);
  const bccText = participantsToText(latest?.bccParticipants);

  return (
    <ModalShell open={open} onClose={onClose} size="large" ariaLabel="Read email">
      <div className="read-email-modal">
        <ModalTopRail
          left={<h2 className="read-email-title">{thread?.subject || '(no subject)'}</h2>}
          right={
            <div className="read-email-actions">
              <TextButton label="Reply" variant="secondary" onClick={onReply} />
              <TextButton label="Forward" variant="secondary" onClick={onForward} />
              {isRead ? (
                <TextButton label="Mark Unread" variant="ghost" onClick={onMarkUnread} />
              ) : (
                <TextButton label="Mark Read" variant="ghost" onClick={onMarkRead} />
              )}
              <TextButton label="Archive" variant="ghost" onClick={onArchive} />
              <TextButton label={folder === 'trash' ? 'Delete Permanently' : 'Delete'} variant="danger" onClick={onDelete} />
            </div>
          }
        />
        <div className="read-email-meta">
          <div className="read-email-meta-row"><span>From</span><strong>{fromText}</strong></div>
          <div className="read-email-meta-row"><span>To</span><strong>{toText}</strong></div>
          {ccText ? <div className="read-email-meta-row"><span>CC</span><strong>{ccText}</strong></div> : null}
          {bccText ? <div className="read-email-meta-row"><span>BCC</span><strong>{bccText}</strong></div> : null}
          <div className="read-email-meta-row"><span>Sent</span><strong>{formatCommsTime(latest?.createdAtMs)}</strong></div>
        </div>
        <article className="read-email-body">
          <p>{latest?.bodyText || 'No email body.'}</p>
        </article>
      </div>
    </ModalShell>
  );
}
