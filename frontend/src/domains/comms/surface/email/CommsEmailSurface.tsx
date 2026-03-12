import { useEffect, useMemo, useState } from 'react';
import type { CommsMessageRecord, CommsThreadRecord } from '@agent-deck/runtime-client';
import { AgentAvatar, ColumnCard, DataListTable, LeftColumnShell, LeftColumnTopBar, TextButton, WorkspaceSurface } from '@/shared/ui';
import { formatCommsTime, useCommsChannelState } from '@/domains/comms/model';
import { inferHeuristicEmailTags } from '@/domains/comms/lib/emailHeuristicTags';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';
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

type ThreadPreview = {
  subject: string;
  snippet: string;
  senderAddress: string;
  senderDisplayName: string;
  senderAvatarDataUrl?: string;
  recipientAddress: string;
  recipientDisplayName: string;
  recipientAvatarDataUrl?: string;
  relativeTime: string;
  absoluteTime: string;
  tags: string[];
};

function humanizeAddressLabel(value: string): string {
  const handle = value.split('@')[0] || value;
  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortBodyPreview(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function participantsToList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
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
    .filter(Boolean);
}

function formatRelativeCommsTime(ms?: number): string {
  if (!ms) {
    return 'just now';
  }
  const deltaMs = Date.now() - ms;
  const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (deltaMinutes < 1) {
    return 'just now';
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays === 1) {
    return 'yesterday';
  }
  if (deltaDays < 7) {
    return `${deltaDays}d ago`;
  }
  const deltaWeeks = Math.floor(deltaDays / 7);
  if (deltaWeeks < 5) {
    return `${deltaWeeks}w ago`;
  }
  return formatCommsTime(ms);
}

function visibleTagSummary(tags: string[], maxVisible = 2): { visible: string[]; overflow: number } {
  const visible = tags.slice(0, maxVisible);
  return { visible, overflow: Math.max(0, tags.length - visible.length) };
}

export function CommsEmailSurface({
  createRequestNonce,
  activeOperatorId,
  activeOperatorName,
  activeOperatorEmailAddress,
  contacts
}: CommsEmailSurfaceProps) {
  const runtimeClient = useRuntimeClient();
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
  const [threadPreviewMap, setThreadPreviewMap] = useState<Record<string, ThreadPreview>>({});
  const state = useCommsChannelState({
    channel: 'email',
    folder,
    activeOperatorId,
    activeOperatorName,
    activeOperatorEmailAddress,
    createRequestNonce,
    newThreadTitle: 'New Email Thread',
    newThreadSubject: 'New Subject',
    autoSelectFirstThread: false
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
  useEffect(() => {
    let cancelled = false;
    const contactByAddress = new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact]));

    const resolveContact = (address: string) => contactByAddress.get(address.toLowerCase()) || null;
    const resolveDisplay = (address: string): string => resolveContact(address)?.name || humanizeAddressLabel(address);

    const resolveFromThread = async (thread: CommsThreadRecord): Promise<ThreadPreview> => {
      let latest: CommsMessageRecord | null = null;
      try {
        const latestOffset = Math.max(0, (thread.messageCount || 0) - 1);
        const result = await runtimeClient.listCommsMessages(thread.threadId, 1, latestOffset);
        latest = result[0] ?? null;
      } catch {
        latest = null;
      }

      const messageSubject = (latest?.subject || '').trim();
      const threadSubject = (thread.subject || thread.title || '').trim();
      const subject = messageSubject || threadSubject || '(no subject)';
      const snippet = shortBodyPreview(latest?.bodyText || '');
      const toList = participantsToList(latest?.toParticipants);
      const fallbackTo = participantsToList((thread.participants as { to?: unknown })?.to);
      const recipientAddress = toList[0] || fallbackTo[0] || '';
      const senderAddress = (latest?.fromAccountRef || (thread.participants as { from?: unknown })?.from || '').toString();
      const senderContact = senderAddress ? resolveContact(senderAddress) : null;
      const recipientContact = recipientAddress ? resolveContact(recipientAddress) : null;
      const senderDisplayName = senderAddress ? resolveDisplay(senderAddress) : 'Unknown sender';
      const recipientDisplayName = recipientAddress ? resolveDisplay(recipientAddress) : 'Unknown recipient';
      const stamp = latest?.createdAtMs || thread.lastMessageAtMs || thread.updatedAtMs;
      return {
        subject,
        snippet: snippet || '(open thread to preview full message)',
        senderAddress,
        senderDisplayName,
        senderAvatarDataUrl: senderContact?.avatarDataUrl,
        recipientAddress,
        recipientDisplayName,
        recipientAvatarDataUrl: recipientContact?.avatarDataUrl,
        relativeTime: formatRelativeCommsTime(stamp),
        absoluteTime: formatCommsTime(stamp),
        tags: inferHeuristicEmailTags(subject, snippet)
      };
    };

    void (async () => {
      if (state.threads.length === 0) {
        if (!cancelled) {
          setThreadPreviewMap({});
        }
        return;
      }
      const entries = await Promise.all(state.threads.map(async (thread) => [thread.threadId, await resolveFromThread(thread)] as const));
      if (!cancelled) {
        setThreadPreviewMap(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contacts, runtimeClient, state.threads]);

  const emailTableColumns = useMemo(
    () => [
      {
        key: 'from',
        header: 'From',
        className: 'comms-email-table-from',
        render: (thread: (typeof state.threads)[number]) => {
          const preview = threadPreviewMap[thread.threadId];
          const isSentFolder = folder === 'sent';
          const displayName = isSentFolder ? preview?.recipientDisplayName || 'Unknown recipient' : preview?.senderDisplayName || 'Unknown sender';
          const address = isSentFolder ? preview?.recipientAddress || '(no recipient)' : preview?.senderAddress || '(no sender)';
          const avatarDataUrl = isSentFolder ? preview?.recipientAvatarDataUrl : preview?.senderAvatarDataUrl;
          return (
            <div className="comms-email-table-from-cell">
              <AgentAvatar name={displayName} src={avatarDataUrl} size="sm" shape="circle" />
              <div className="comms-email-table-from-copy">
                <strong>{displayName}</strong>
                <p>{address}</p>
              </div>
            </div>
          );
        }
      },
      {
        key: 'message',
        header: 'Message',
        className: 'comms-email-table-message',
        render: (thread: (typeof state.threads)[number]) => (
          (() => {
            const preview = threadPreviewMap[thread.threadId];
            const { visible, overflow } = visibleTagSummary(preview?.tags || []);
            return (
              <div className="comms-email-table-message-cell">
                <div className="comms-email-table-message-top">
                  <strong>{preview?.subject || '(no subject)'}</strong>
                  {visible.length > 0 || overflow > 0 ? (
                    <div className="comms-email-table-tags-inline">
                      {visible.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                      {overflow > 0 ? <span>+{overflow}</span> : null}
                    </div>
                  ) : null}
                </div>
                <p>{preview?.snippet || '(open thread to preview full message)'}</p>
              </div>
            );
          })()
        )
      },
      {
        key: 'when',
        header: 'When',
        className: 'comms-email-table-when',
        render: (thread: (typeof state.threads)[number]) => (
          <div className="comms-email-table-when-cell">
            <span>{threadPreviewMap[thread.threadId]?.relativeTime || formatRelativeCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)}</span>
            <small>{threadPreviewMap[thread.threadId]?.absoluteTime || formatCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)}</small>
            {(thread.state || '').toLowerCase() === 'unread' ? <em>Unread</em> : null}
          </div>
        )
      }
    ],
    [folder, state.threads, threadPreviewMap]
  );

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
                  <ColumnCard
                    key={item}
                    as="button"
                    className="comms-email-folder"
                    active={folder === item}
                    title={item}
                    onClick={() => setFolder(item)}
                  />
                ))}
                <button type="button" className="comms-email-folder-add" onClick={handleAddFolder} aria-label="Add email folder">
                  +
                </button>
              </div>
            </div>
          </aside>
        }
        right={
          <WorkspaceSurface className="comms-email-main">
            <LeftColumnTopBar
              tone="raised"
              left={<span className="comms-email-action-rail-title">{folder.charAt(0).toUpperCase() + folder.slice(1)}</span>}
              right={
                <div className="comms-email-main-actions">
                  {folder === 'trash' ? (
                    <TextButton label="Empty Trash" variant="danger" size="sm" onClick={() => void handleEmptyTrash()} />
                  ) : (
                    <span className="comms-email-action-rail-meta">{accountLabel}</span>
                  )}
                </div>
              }
            />
            <div className="comms-email-mail-list">
                {state.loading ? <div className="comms-email-empty">Loading threads...</div> : null}
                {!state.loading ? (
                  <DataListTable
                    variant="full-bleed"
                    showHeader={false}
                    columns={emailTableColumns}
                    rows={state.threads}
                    getRowKey={(thread) => thread.threadId}
                    activeRowKey={state.activeThreadId}
                    rowClassName={(thread) => ((thread.state || '').toLowerCase() === 'unread' ? 'comms-email-row-unread' : undefined)}
                    onRowClick={(thread) => {
                      state.setActiveThreadId(thread.threadId);
                      setReadOpen(true);
                    }}
                    emptyState={<div className="comms-email-empty">No threads yet.</div>}
                  />
                ) : null}
            </div>
            <CommsComposeFab ariaLabel="Compose email" onClick={() => setComposeOpen(true)} />
          </WorkspaceSurface>
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
        onClose={() => {
          setReadOpen(false);
          state.setActiveThreadId(null);
        }}
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
