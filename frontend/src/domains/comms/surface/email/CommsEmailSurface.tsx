import { useMemo, useState } from 'react';
import { LeftColumnShell, LeftColumnTopBar, TextButton } from '@/shared/ui';
import { formatCommsTime, useCommsChannelState } from '@/domains/comms/model';
import { CommsComposeFab } from '@/domains/comms/surface/shared';
import { ComposeEmailModal, type ComposeEmailContact } from './compose-modal';
import { ReadEmailModal } from './read-modal';
import './CommsEmailSurface.css';

const DEFAULT_EMAIL_FOLDERS = ['inbox', 'sent', 'drafts', 'spam', 'archive', 'trash'];

type CommsEmailSurfaceProps = {
  createRequestNonce: number;
  activeOperatorId: string | null;
  activeOperatorName: string;
  activeOperatorEmailAddress: string;
  contacts: ComposeEmailContact[];
};

export function CommsEmailSurface({
  createRequestNonce,
  activeOperatorId,
  activeOperatorName,
  activeOperatorEmailAddress,
  contacts
}: CommsEmailSurfaceProps) {
  const [folder, setFolder] = useState('inbox');
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sendingCompose, setSendingCompose] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const state = useCommsChannelState({
    channel: 'email',
    folder,
    activeOperatorId,
    activeOperatorName,
    activeOperatorEmailAddress,
    createRequestNonce,
    newThreadTitle: 'New Email Thread',
    newThreadSubject: 'New Subject'
  });

  const emailFolders = useMemo(() => [...DEFAULT_EMAIL_FOLDERS, ...customFolders], [customFolders]);
  const accountLabel = state.activeAccount ? `${state.activeAccount.displayName} · ${state.activeAccount.address}` : 'No account';
  const fromLabel = state.activeAccount?.address ?? 'No account configured';
  const selectedThread = useMemo(
    () => state.threads.find((thread) => thread.threadId === state.activeThreadId) ?? null,
    [state.activeThreadId, state.threads]
  );
  const selectedThreadIsRead = (selectedThread?.state || '').toLowerCase() === 'read';
  const latestSelectedMessage = state.messages[state.messages.length - 1] ?? null;

  const splitRecipients = (value: string) =>
    value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const handleAddFolder = () => {
    const nextLabel = `custom-${customFolders.length + 1}`;
    setCustomFolders((current) => [...current, nextLabel]);
    setFolder(nextLabel);
  };

  const resetCompose = () => {
    setComposeTo('');
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject('');
    setComposeBody('');
  };

  const formatQuotedBody = (sourceBody: string, sourceDate?: number) => {
    const lines = sourceBody.split('\n').map((line) => `> ${line}`);
    const stamp = sourceDate ? formatCommsTime(sourceDate) : 'earlier';
    return `\n\nOn ${stamp}, ${latestSelectedMessage?.fromAccountRef || 'sender'} wrote:\n${lines.join('\n')}`;
  };

  const parseRecipientText = (value: unknown): string => {
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
  };

  const handleReplyFromRead = () => {
    if (!latestSelectedMessage) {
      return;
    }
    const to = latestSelectedMessage.direction === 'inbound'
      ? latestSelectedMessage.fromAccountRef
      : parseRecipientText(latestSelectedMessage.toParticipants);
    const subjectBase = selectedThread?.subject || latestSelectedMessage.subject || '(no subject)';
    setComposeTo(to);
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject(subjectBase.toLowerCase().startsWith('re:') ? subjectBase : `Re: ${subjectBase}`);
    setComposeBody(formatQuotedBody(latestSelectedMessage.bodyText, latestSelectedMessage.createdAtMs));
    setReadOpen(false);
    setComposeOpen(true);
  };

  const handleForwardFromRead = () => {
    if (!latestSelectedMessage) {
      return;
    }
    const subjectBase = selectedThread?.subject || latestSelectedMessage.subject || '(no subject)';
    setComposeTo('');
    setComposeCc('');
    setComposeBcc('');
    setComposeSubject(subjectBase.toLowerCase().startsWith('fwd:') ? subjectBase : `Fwd: ${subjectBase}`);
    setComposeBody(formatQuotedBody(latestSelectedMessage.bodyText, latestSelectedMessage.createdAtMs));
    setReadOpen(false);
    setComposeOpen(true);
  };

  const handleArchiveFromRead = async () => {
    if (!selectedThread) {
      return;
    }
    await state.updateThread(selectedThread.threadId, { folder: 'archive' });
    setReadOpen(false);
    setFolder('archive');
  };

  const handleMarkRead = async () => {
    if (!selectedThread) {
      return;
    }
    await state.updateThread(selectedThread.threadId, { state: 'read' });
  };

  const handleMarkUnread = async () => {
    if (!selectedThread) {
      return;
    }
    await state.updateThread(selectedThread.threadId, { state: 'unread' });
  };

  const handleDeleteFromRead = async () => {
    if (!selectedThread) {
      return;
    }
    if (folder === 'trash') {
      await state.deleteThread(selectedThread.threadId);
    } else {
      await state.updateThread(selectedThread.threadId, { folder: 'trash' });
    }
    setReadOpen(false);
  };

  const handleEmptyTrash = async () => {
    if (folder !== 'trash' || state.threads.length === 0) {
      return;
    }
    await Promise.all(state.threads.map((thread) => state.deleteThread(thread.threadId)));
  };

  const handleSendCompose = async () => {
    if (sendingCompose) {
      return;
    }
    const to = splitRecipients(composeTo);
    const cc = splitRecipients(composeCc);
    const bcc = splitRecipients(composeBcc);
    if (to.length === 0 || composeBody.trim().length === 0) {
      return;
    }
    setSendingCompose(true);
    try {
      const participants = { to, cc, bcc };
      const thread = selectedThread && composeSubject.toLowerCase().startsWith('re:')
        ? selectedThread
        : await state.createThread({
            title: composeSubject.trim() || to[0],
            subject: composeSubject.trim() || '(no subject)',
            participants,
            folder: 'sent'
          });
      if (thread) {
        await state.appendMessage({
          threadId: thread.threadId,
          bodyText: composeBody,
          subject: composeSubject.trim() || '(no subject)',
          toParticipants: to,
          ccParticipants: cc,
          bccParticipants: bcc,
          direction: 'outbound'
        });
      }
      setComposeOpen(false);
      resetCompose();
      setFolder('sent');
    } finally {
      setSendingCompose(false);
    }
  };

  return (
    <section className="comms-email-surface">
      <LeftColumnShell
        width="wide"
        left={
          <aside className="comms-email-sidebar">
            <LeftColumnTopBar
              tone="raised"
              left={<span className="comms-email-sidebar-title">Email Folders</span>}
              right={<span className="comms-email-sidebar-count">{state.threads.length} thread(s)</span>}
            />
            <div className="comms-email-sidebar-body">
              <div className="comms-email-folders">
                {emailFolders.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`comms-email-folder ${folder === item ? 'is-active' : ''}`}
                    onClick={() => setFolder(item)}
                  >
                    {item}
                  </button>
                ))}
                <button type="button" className="comms-email-folder-add" onClick={handleAddFolder} aria-label="Add email folder">
                  +
                </button>
              </div>
            </div>
          </aside>
        }
        right={
          <section className="comms-email-main">
            <header className="comms-email-main-header">
              <div className="comms-email-main-title">
                <h2>{folder.charAt(0).toUpperCase() + folder.slice(1)}</h2>
                <p>{state.threads.length} email(s) · {accountLabel}</p>
              </div>
              {folder === 'trash' ? (
                <div className="comms-email-main-actions">
                  <TextButton label="Empty Trash" variant="danger" size="sm" onClick={() => void handleEmptyTrash()} />
                </div>
              ) : null}
            </header>
            <div className="comms-email-mail-list">
                {state.loading ? <div className="comms-email-empty">Loading threads...</div> : null}
                {!state.loading && state.threads.length === 0 ? <div className="comms-email-empty">No threads yet.</div> : null}
                {state.threads.map((thread) => (
                  <button
                    key={thread.threadId}
                    type="button"
                    className={`comms-email-mail-row ${state.activeThreadId === thread.threadId ? 'is-active' : ''} ${(thread.state || '').toLowerCase() === 'unread' ? 'is-unread' : ''}`}
                    onClick={() => {
                      state.setActiveThreadId(thread.threadId);
                      setReadOpen(true);
                    }}
                  >
                    <div className="comms-email-mail-row-top">
                      <strong>{thread.title || '(untitled)'}</strong>
                      <span>{formatCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)}</span>
                    </div>
                    <p className="comms-email-mail-row-subject">{thread.subject || '(no subject)'}</p>
                    <p className="comms-email-mail-row-meta">
                      {thread.messageCount} message(s)
                      {(thread.state || '').toLowerCase() === 'unread' ? ' · unread' : ''}
                    </p>
                  </button>
                ))}
            </div>
            <CommsComposeFab ariaLabel="Compose email" onClick={() => setComposeOpen(true)} />
          </section>
        }
      />
      <ComposeEmailModal
        open={composeOpen}
        fromLabel={fromLabel}
        toValue={composeTo}
        ccValue={composeCc}
        bccValue={composeBcc}
        subjectValue={composeSubject}
        bodyValue={composeBody}
        sending={sendingCompose}
        onClose={() => setComposeOpen(false)}
        onToChange={setComposeTo}
        onCcChange={setComposeCc}
        onBccChange={setComposeBcc}
        onSubjectChange={setComposeSubject}
        onBodyChange={setComposeBody}
        onSend={() => void handleSendCompose()}
        contacts={contacts}
        onInsertTo={(address) => {
          const next = composeTo.trim();
          setComposeTo(next.length === 0 ? address : `${next}, ${address}`);
        }}
      />
      <ReadEmailModal
        open={readOpen}
        thread={selectedThread}
        messages={state.messages}
        folder={folder}
        isRead={selectedThreadIsRead}
        onClose={() => setReadOpen(false)}
        onReply={handleReplyFromRead}
        onForward={handleForwardFromRead}
        onMarkRead={() => void handleMarkRead()}
        onMarkUnread={() => void handleMarkUnread()}
        onArchive={() => void handleArchiveFromRead()}
        onDelete={() => void handleDeleteFromRead()}
      />
    </section>
  );
}
