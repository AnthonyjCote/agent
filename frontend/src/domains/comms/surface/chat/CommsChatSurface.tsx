import { useEffect, useMemo, useState } from 'react';
import {
  AgentAvatar,
  ColumnCard,
  ConfirmDialogModal,
  LeftColumnShell,
  LeftColumnTopBar,
  ModalShell,
  ModalTopRail,
  TextButton,
  TextField
} from '@/shared/ui';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';
import { formatCommsTime, useCommsChannelState } from '@/domains/comms/model';
import './CommsChatSurface.css';

type ChatContact = {
  id: string;
  name: string;
  title: string;
  address: string;
  avatarDataUrl?: string;
};

type CommsChatSurfaceProps = {
  createRequestNonce: number;
  activeOperatorId: string | null;
  activeOperatorName: string;
  activeOperatorEmailAddress: string;
  contacts: ChatContact[];
};

type ChatParticipantsMeta = {
  kind?: 'dm' | 'group';
  memberOperatorIds?: string[];
  memberAddresses?: string[];
};

function parseParticipantsMeta(value: unknown): ChatParticipantsMeta {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const object = value as Record<string, unknown>;
  return {
    kind: object.kind === 'dm' || object.kind === 'group' ? object.kind : undefined,
    memberOperatorIds: Array.isArray(object.memberOperatorIds)
      ? object.memberOperatorIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    memberAddresses: Array.isArray(object.memberAddresses)
      ? object.memberAddresses.filter((item): item is string => typeof item === 'string')
      : undefined
  };
}

function normalizedKey(values: string[]): string {
  return values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

export function CommsChatSurface({
  createRequestNonce,
  activeOperatorId,
  activeOperatorName,
  activeOperatorEmailAddress,
  contacts
}: CommsChatSurfaceProps) {
  const runtimeClient = useRuntimeClient();
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);

  const state = useCommsChannelState({
    channel: 'chat',
    activeOperatorId,
    activeOperatorName,
    activeOperatorEmailAddress,
    createRequestNonce,
    newThreadTitle: 'New Chat Thread'
  });

  useEffect(() => {
    if (contacts.length === 0) {
      return;
    }
    void (async () => {
      const accounts = await runtimeClient.listCommsAccounts({ channel: 'chat' });
      const byOperatorId = new Map(accounts.map((account) => [account.operatorId, account]));
      const missing = contacts.filter((contact) => !byOperatorId.has(contact.id));
      const stale = contacts.filter((contact) => {
        const account = byOperatorId.get(contact.id);
        return account ? account.address !== contact.address : false;
      });
      if (missing.length === 0 && stale.length === 0) {
        return;
      }
      await Promise.all(
        [...missing, ...stale].map((contact) =>
          runtimeClient.upsertCommsAccount({
            accountId: `acct_chat_${contact.id}`,
            operatorId: contact.id,
            channel: 'chat',
            address: contact.address,
            displayName: `${contact.name} (CHAT)`
          })
        )
      );
    })();
  }, [contacts, runtimeClient]);

  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const contactByAddress = useMemo(() => new Map(contacts.map((contact) => [contact.address, contact])), [contacts]);
  const accountLabel = state.activeAccount ? state.activeAccount.displayName : 'No account';

  const threadsWithMeta = useMemo(
    () =>
      state.threads.map((thread) => {
        const meta = parseParticipantsMeta(thread.participants);
        const kind = meta.kind ?? 'group';
        return { thread, meta, kind };
      }),
    [state.threads]
  );

  const directThreads = useMemo(
    () => threadsWithMeta.filter((item) => item.kind === 'dm'),
    [threadsWithMeta]
  );
  const groupThreads = useMemo(
    () => threadsWithMeta.filter((item) => item.kind !== 'dm'),
    [threadsWithMeta]
  );

  const dmTargets = useMemo(
    () => contacts.filter((contact) => contact.id !== activeOperatorId),
    [activeOperatorId, contacts]
  );
  const groupTargets = useMemo(
    () => contacts.filter((contact) => contact.id !== activeOperatorId),
    [activeOperatorId, contacts]
  );

  const createOrReuseDm = async (targetId: string) => {
    if (!activeOperatorId || !targetId) {
      return;
    }
    const participantIds = [activeOperatorId, targetId];
    const participantKey = normalizedKey(participantIds);
    const existing = directThreads.find((item) => {
      const members = item.meta.memberOperatorIds ?? [];
      return normalizedKey(members) === participantKey;
    });
    if (existing) {
      state.setActiveThreadId(existing.thread.threadId);
      setNewDmOpen(false);
      return;
    }

    const target = contactById.get(targetId);
    const sender = contactById.get(activeOperatorId);
    if (!target || !sender) {
      return;
    }

    const created = await state.createThread({
      title: target.name,
      participants: {
        kind: 'dm',
        memberOperatorIds: [activeOperatorId, targetId],
        memberAddresses: [sender.address, target.address]
      },
      folder: 'inbox'
    });
    if (created) {
      state.setActiveThreadId(created.threadId);
    }
    setNewDmOpen(false);
  };

  const createGroup = async () => {
    if (!activeOperatorId || newGroupMemberIds.length === 0) {
      return;
    }
    const memberIds = Array.from(new Set([activeOperatorId, ...newGroupMemberIds]));
    const memberAddresses = memberIds
      .map((memberId) => contactById.get(memberId)?.address)
      .filter((value): value is string => Boolean(value));
    const title = newGroupName.trim() || 'New Group';

    const created = await state.createThread({
      title,
      participants: {
        kind: 'group',
        memberOperatorIds: memberIds,
        memberAddresses
      },
      folder: 'inbox'
    });
    if (created) {
      state.setActiveThreadId(created.threadId);
    }
    setNewGroupOpen(false);
    setNewGroupName('');
    setNewGroupMemberIds([]);
  };

  const activeThreadMeta = useMemo(
    () => parseParticipantsMeta(state.activeThread?.participants),
    [state.activeThread]
  );

  const sendToParticipants = useMemo(() => {
    const addresses = activeThreadMeta.memberAddresses ?? [];
    if (!state.activeAccount?.address) {
      return [];
    }
    return addresses.filter((address) => address !== state.activeAccount?.address);
  }, [activeThreadMeta.memberAddresses, state.activeAccount?.address]);

  const handleSend = async () => {
    if (!state.activeThreadId || !state.composer.trim() || sendToParticipants.length === 0) {
      return;
    }
    await state.appendMessage({
      threadId: state.activeThreadId,
      bodyText: state.composer.trim(),
      toParticipants: sendToParticipants,
      direction: 'outbound'
    });
    state.setComposer('');
  };

  const confirmDeleteThread = async () => {
    if (!pendingDeleteThreadId || deletingThread) {
      return;
    }
    setDeletingThread(true);
    try {
      await state.deleteThread(pendingDeleteThreadId);
      setPendingDeleteThreadId(null);
    } finally {
      setDeletingThread(false);
    }
  };

  return (
    <section className="comms-chat-surface">
      <LeftColumnShell
        width="wide"
        left={
          <aside className="comms-chat-sidebar">
            <LeftColumnTopBar
              tone="raised"
              left={<span className="comms-chat-sidebar-title">Chats</span>}
              right={
                <div className="comms-chat-sidebar-actions">
                  <button type="button" className="comms-chat-sidebar-icon" aria-label="New DM" onClick={() => setNewDmOpen(true)}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M10 4.2v11.6M4.2 10h11.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>DM</span>
                  </button>
                  <button type="button" className="comms-chat-sidebar-icon" aria-label="New Group" onClick={() => setNewGroupOpen(true)}>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M10 4.2v11.6M4.2 10h11.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>Group</span>
                  </button>
                </div>
              }
            />
            <div className="comms-chat-thread-list">
              {state.loading ? <div className="comms-chat-empty">Loading chats...</div> : null}
              {!state.loading && state.threads.length === 0 ? <div className="comms-chat-empty">No chats yet.</div> : null}

              <section className="comms-chat-thread-section">
                <header>Direct Messages</header>
                {directThreads.map(({ thread }) => (
                  <ColumnCard
                    key={thread.threadId}
                    className="comms-chat-thread-item"
                    active={state.activeThreadId === thread.threadId}
                  >
                    <button
                      type="button"
                      className="comms-chat-thread-main"
                      onClick={() => state.setActiveThreadId(thread.threadId)}
                    >
                      <strong>{thread.title}</strong>
                      <span>{thread.messageCount} msgs · {formatCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)}</span>
                    </button>
                    <button
                      type="button"
                      className="comms-chat-thread-delete"
                      aria-label={`Delete chat ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteThreadId(thread.threadId);
                      }}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M5.8 6.2h8.4m-7.1 0v8m2.9-8v8m2.9-8v8M7.7 4.5h4.6l.5 1.2h2v1.5H5.2V5.7h2zM6.7 7.2h6.6v8.1a1 1 0 0 1-1 1H7.7a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </ColumnCard>
                ))}
              </section>

              <section className="comms-chat-thread-section">
                <header>Group Messages</header>
                {groupThreads.map(({ thread }) => (
                  <ColumnCard
                    key={thread.threadId}
                    className="comms-chat-thread-item"
                    active={state.activeThreadId === thread.threadId}
                  >
                    <button
                      type="button"
                      className="comms-chat-thread-main"
                      onClick={() => state.setActiveThreadId(thread.threadId)}
                    >
                      <strong># {thread.title}</strong>
                      <span>{thread.messageCount} msgs · {formatCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)}</span>
                    </button>
                    <button
                      type="button"
                      className="comms-chat-thread-delete"
                      aria-label={`Delete chat ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteThreadId(thread.threadId);
                      }}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M5.8 6.2h8.4m-7.1 0v8m2.9-8v8m2.9-8v8M7.7 4.5h4.6l.5 1.2h2v1.5H5.2V5.7h2zM6.7 7.2h6.6v8.1a1 1 0 0 1-1 1H7.7a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </ColumnCard>
                ))}
              </section>
            </div>
          </aside>
        }
        right={
          <section className="comms-chat-main">
            <header className="comms-chat-main-header">
              <div className="comms-chat-main-title">
                <h2>{state.activeThread?.title || 'Select a chat'}</h2>
                <p>{accountLabel}</p>
              </div>
            </header>
            <div className="comms-chat-message-list">
              {state.messages.length === 0 ? <div className="comms-chat-empty">No messages.</div> : null}
              {state.messages.map((message) => {
                const senderContact = contactByAddress.get(message.fromAccountRef);
                const senderLabel = message.direction === 'outbound' ? 'You' : senderContact?.name || message.fromAccountRef;
                const senderTitle = message.direction === 'outbound' ? undefined : senderContact?.title;
                const showAvatar = message.direction !== 'outbound' && (activeThreadMeta.kind ?? 'group') === 'group';
                return (
                  <div
                    key={message.messageId}
                    className={`comms-chat-message-row ${message.direction === 'outbound' ? 'outbound' : 'inbound'} ${showAvatar ? 'has-avatar' : ''}`}
                  >
                    {showAvatar ? (
                      <div className="comms-chat-message-avatar">
                        <AgentAvatar
                          name={senderContact?.name || senderLabel}
                          src={senderContact?.avatarDataUrl}
                          size="sm"
                        />
                      </div>
                    ) : null}
                    <div className={`comms-chat-message-stack ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}>
                      <article
                        className={`comms-chat-message ${message.direction === 'outbound' ? 'outbound' : 'inbound'} ${showAvatar ? 'has-tail' : ''}`}
                      >
                        <div className={`comms-chat-message-meta ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}>
                          <strong>{senderLabel}</strong>
                          {senderTitle ? <span>{senderTitle}</span> : null}
                        </div>
                        <p>{message.bodyText}</p>
                      </article>
                      <div className={`comms-chat-message-time ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}>
                        {formatCommsTime(message.createdAtMs)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <footer className="comms-chat-composer">
              <TextField
                value={state.composer}
                onValueChange={state.setComposer}
                placeholder="Message"
                ariaLabel="Chat composer"
              />
              <TextButton label="Send" variant="primary" onClick={() => void handleSend()} />
            </footer>
          </section>
        }
      />

      <ModalShell open={newDmOpen} onClose={() => setNewDmOpen(false)} size="medium" ariaLabel="New direct message">
        <section className="comms-chat-create-modal">
          <ModalTopRail
            left={<h2 className="comms-chat-create-title">New Direct Message</h2>}
            right={
              <div className="comms-chat-create-actions">
                <TextButton label="Cancel" variant="ghost" onClick={() => setNewDmOpen(false)} />
              </div>
            }
          />
          <div className="comms-chat-create-fields">
            <div className="comms-chat-contact-list">
              {dmTargets.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="comms-chat-contact-card"
                  onClick={() => void createOrReuseDm(contact.id)}
                >
                  <AgentAvatar name={contact.name} src={contact.avatarDataUrl} size="sm" />
                  <div className="comms-chat-contact-copy">
                    <strong>{contact.name}</strong>
                    <span>{contact.title}</span>
                    <em>{contact.address}</em>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </ModalShell>

      <ModalShell open={newGroupOpen} onClose={() => setNewGroupOpen(false)} size="medium" ariaLabel="New group chat">
        <section className="comms-chat-create-modal">
          <ModalTopRail
            left={<h2 className="comms-chat-create-title">New Group Chat</h2>}
            right={
              <div className="comms-chat-create-actions">
                <TextButton label="Cancel" variant="ghost" onClick={() => setNewGroupOpen(false)} />
                <TextButton label="Create" variant="primary" onClick={() => void createGroup()} />
              </div>
            }
          />
          <div className="comms-chat-create-fields">
            <label>
              <span>Group Name</span>
              <TextField value={newGroupName} onValueChange={setNewGroupName} ariaLabel="Group name" placeholder="Ops Leadership" />
            </label>
            <div className="comms-chat-create-members">
              <span>Participants</span>
              <div className="comms-chat-contact-list">
                {groupTargets.map((contact) => {
                  const checked = newGroupMemberIds.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className={`comms-chat-contact-card ${checked ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (checked) {
                          setNewGroupMemberIds((current) => current.filter((id) => id !== contact.id));
                        } else {
                          setNewGroupMemberIds((current) => Array.from(new Set([...current, contact.id])));
                        }
                      }}
                    >
                      <AgentAvatar name={contact.name} src={contact.avatarDataUrl} size="sm" />
                      <div className="comms-chat-contact-copy">
                        <strong>{contact.name}</strong>
                        <span>{contact.title}</span>
                        <em>{contact.address}</em>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </ModalShell>

      <ConfirmDialogModal
        open={pendingDeleteThreadId != null}
        title="Delete Chat Thread?"
        message="This will permanently remove the thread and all messages in it."
        confirmLabel={deletingThread ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        onCancel={() => {
          if (!deletingThread) {
            setPendingDeleteThreadId(null);
          }
        }}
        onConfirm={() => void confirmDeleteThread()}
      />
    </section>
  );
}
