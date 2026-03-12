import { useEffect, useMemo, useState } from 'react';
import { AgentAvatar, ConfirmDialogModal, DataListTable, IconButton, LeftColumnShell, ActionRail, TextButton, TextField, WorkspaceSurface } from '@/shared/ui';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';
import { formatCommsTime, useCommsChannelState } from '@/domains/comms/model';
import { ComposeSmsModal, type ComposeSmsContact } from './compose-modal';
import { CommsComposeFab } from '@/domains/comms/surface/shared';
import './CommsSmsSurface.css';

function parseSmsRecipientNumber(value: string): string {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1].trim();
  }
  return trimmed;
}

type CommsSmsSurfaceProps = {
  createRequestNonce: number;
  activeOperatorId: string | null;
  activeOperatorName: string;
  activeOperatorEmailAddress: string;
  contacts: Array<{
    id: string;
    name: string;
    title: string;
    avatarDataUrl?: string;
  }>;
};

type SmsThreadRow = {
  threadId: string;
  displayName: string;
  number: string;
  avatarDataUrl?: string;
  state: string;
  updatedLabel: string;
};

export function CommsSmsSurface({
  createRequestNonce,
  activeOperatorId,
  activeOperatorName,
  activeOperatorEmailAddress,
  contacts
}: CommsSmsSurfaceProps) {
  const runtimeClient = useRuntimeClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sendingCompose, setSendingCompose] = useState(false);
  const [contactNumbers, setContactNumbers] = useState<ComposeSmsContact[]>([]);
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);

  const state = useCommsChannelState({
    channel: 'sms',
    activeOperatorId,
    activeOperatorName,
    activeOperatorEmailAddress,
    createRequestNonce,
    newThreadTitle: 'New SMS Thread'
  });

  useEffect(() => {
    if (contacts.length === 0) {
      setContactNumbers([]);
      return;
    }
    void (async () => {
      let accounts = await runtimeClient.listCommsAccounts({ channel: 'sms' });
      const invalid = accounts.filter((account) => !/^\+\d{8,15}$/.test(account.address.trim()));
      if (invalid.length > 0) {
        await Promise.all(
          invalid.map((account) =>
            runtimeClient.upsertCommsAccount({
              accountId: account.accountId,
              operatorId: account.operatorId,
              channel: 'sms',
              address: '',
              displayName: account.displayName
            })
          )
        );
        accounts = await runtimeClient.listCommsAccounts({ channel: 'sms' });
      }
      const accountsByOperatorId = new Map(accounts.map((account) => [account.operatorId, account]));
      const missing = contacts.filter((contact) => !accountsByOperatorId.has(contact.id));
      if (missing.length > 0) {
        await Promise.all(
          missing.map((contact) =>
            runtimeClient.upsertCommsAccount({
              accountId: `acct_sms_${contact.id}`,
              operatorId: contact.id,
              channel: 'sms',
              address: '',
              displayName: `${contact.name} (SMS)`
            })
          )
        );
        accounts = await runtimeClient.listCommsAccounts({ channel: 'sms' });
      }
      const refreshedByOperatorId = new Map(accounts.map((account) => [account.operatorId, account]));
      const mapped = contacts.map((contact) => {
        const account = refreshedByOperatorId.get(contact.id);
        if (!account) {
          return null;
        }
        return {
          id: contact.id,
          name: contact.name,
          title: contact.title,
          address: account.address,
          avatarDataUrl: contact.avatarDataUrl
        } as ComposeSmsContact;
      });
      setContactNumbers(mapped.filter((value) => value !== null) as ComposeSmsContact[]);
    })();
  }, [contacts, runtimeClient]);

  const activeThreadPeerNumber = useMemo(() => {
    if (!state.activeThread) {
      return '';
    }
    const participants = state.activeThread.participants;
    if (participants && typeof participants === 'object' && 'peerNumber' in (participants as Record<string, unknown>)) {
      const peer = (participants as Record<string, unknown>).peerNumber;
      if (typeof peer === 'string') {
        return peer;
      }
    }
    return '';
  }, [state.activeThread]);

  const fromLabel = state.activeAccount?.address ?? 'No account configured';
  const activeThreadContact = useMemo(
    () => contactNumbers.find((contact) => contact.address === activeThreadPeerNumber) ?? null,
    [activeThreadPeerNumber, contactNumbers]
  );
  const contactByNumber = useMemo(
    () => new Map(contactNumbers.map((contact) => [contact.address, contact])),
    [contactNumbers]
  );
  const smsThreadRows = useMemo<SmsThreadRow[]>(
    () =>
      state.threads.map((thread) => {
        const participants = thread.participants as Record<string, unknown> | null;
        const peerNumber = participants && typeof participants.peerNumber === 'string' ? participants.peerNumber : '';
        const contact = contactByNumber.get(peerNumber);
        return {
          threadId: thread.threadId,
          displayName: contact?.name || thread.title || peerNumber || 'Unknown contact',
          number: contact?.address || peerNumber || thread.title || '(unknown number)',
          avatarDataUrl: contact?.avatarDataUrl,
          state: (thread.state || 'active').toString(),
          updatedLabel: formatCommsTime(thread.lastMessageAtMs || thread.updatedAtMs)
        };
      }),
    [contactByNumber, state.threads]
  );

  const handleSendCompose = async () => {
    if (sendingCompose) {
      return;
    }
    const to = composeTo.trim();
    const body = composeBody.trim();
    if (!to || !body) {
      return;
    }
    const toNumber = parseSmsRecipientNumber(to);
    if (!toNumber) {
      return;
    }
    setSendingCompose(true);
    try {
      const thread = await state.createThread({
        title: to,
        participants: { peerNumber: toNumber },
        folder: 'inbox'
      });
      if (thread) {
        const message = await state.appendMessage({
          threadId: thread.threadId,
          bodyText: body,
          toParticipants: [toNumber],
          direction: 'outbound'
        });
        if (message) {
          state.setActiveThreadId(message.threadId);
        }
      }
      setComposeOpen(false);
      setComposeBody('');
      setComposeTo('');
    } finally {
      setSendingCompose(false);
    }
  };

  const handleInlineSend = async () => {
    if (!activeThreadPeerNumber || !state.activeThreadId || !state.composer.trim()) {
      return;
    }
    await state.appendMessage({
      threadId: state.activeThreadId,
      bodyText: state.composer.trim(),
      toParticipants: [activeThreadPeerNumber],
      direction: 'outbound'
    });
    state.setComposer('');
  };

  const handleConfirmDeleteThread = async () => {
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
    <section className="comms-sms-surface">
      <LeftColumnShell
        width="wide"
        left={
          <aside className="comms-sms-sidebar">
            <ActionRail
              tone="raised"
              left={<span className="comms-sms-sidebar-title">SMS Threads</span>}
              right={<span className="comms-sms-sidebar-count">{state.threads.length}</span>}
            />
            <div className="comms-sms-thread-list">
              {state.loading ? <div className="comms-sms-empty">Loading threads...</div> : null}
              {!state.loading ? (
                <DataListTable
                  variant="full-bleed"
                  showHeader={false}
                  columns={[
                    {
                      key: 'contact',
                      header: 'Contact',
                      className: 'comms-sms-thread-contact',
                      render: (row: SmsThreadRow) => (
                        <div className="comms-sms-thread-contact-cell">
                          <AgentAvatar name={row.displayName} src={row.avatarDataUrl} size="sm" />
                          <div className="comms-sms-thread-contact-copy">
                            <strong>{row.displayName}</strong>
                            <span>{row.number}</span>
                          </div>
                        </div>
                      )
                    },
                    {
                      key: 'state',
                      header: 'State',
                      className: 'comms-sms-thread-state',
                      render: (row: SmsThreadRow) => (
                        <div className="comms-sms-thread-state-cell">
                          <em>{row.state}</em>
                          <span>{row.updatedLabel}</span>
                        </div>
                      )
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      className: 'comms-sms-thread-actions',
                      render: (row: SmsThreadRow) => (
                        <IconButton
                          variant="compact-action"
                          ariaLabel={`Delete SMS thread ${row.displayName}`}
                          icon={(
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M5.8 6.2h8.4m-7.1 0v8m2.9-8v8m2.9-8v8M7.7 4.5h4.6l.5 1.2h2v1.5H5.2V5.7h2zM6.7 7.2h6.6v8.1a1 1 0 0 1-1 1H7.7a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteThreadId(row.threadId);
                          }}
                        />
                      )
                    }
                  ]}
                  rows={smsThreadRows}
                  getRowKey={(row) => row.threadId}
                  activeRowKey={state.activeThreadId}
                  rowClassName={(row) => (row.state.toLowerCase() === 'unread' ? 'comms-sms-thread-row-unread' : undefined)}
                  onRowClick={(row) => state.setActiveThreadId(row.threadId)}
                  emptyState={<div className="comms-sms-empty">No threads yet.</div>}
                />
              ) : null}
            </div>
          </aside>
        }
        right={
          <WorkspaceSurface className="comms-sms-main">
            <div className="comms-sms-stage">
              <div className="comms-sms-phone">
                <div className="comms-sms-notch" />
                <div className="comms-sms-screen">
                  <header className="comms-sms-thread-header">
                    {activeThreadContact ? (
                      <AgentAvatar
                        name={activeThreadContact.name}
                        src={activeThreadContact.avatarDataUrl}
                        size="sm"
                      />
                    ) : (
                      <div className="comms-sms-thread-header-fallback" aria-hidden="true">
                        <svg viewBox="0 0 20 20">
                          <circle cx="10" cy="7" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <path
                            d="M4.5 16c.9-2.7 2.9-4.2 5.5-4.2s4.6 1.5 5.5 4.2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="comms-sms-thread-header-copy">
                      <strong>{activeThreadContact ? activeThreadContact.name : activeThreadPeerNumber || 'No contact selected'}</strong>
                      <span>{activeThreadContact ? activeThreadContact.address : activeThreadPeerNumber ? 'Unknown contact' : 'Select a thread'}</span>
                    </div>
                  </header>
                  <div className="comms-sms-messages">
                    {state.messages.length === 0 ? <div className="comms-sms-empty">No messages.</div> : null}
                    {state.messages.map((message) => (
                      <div
                        key={message.messageId}
                        className={`comms-sms-message-wrap ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}
                      >
                        <article className={`comms-sms-message ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}>
                          <p>{message.bodyText}</p>
                        </article>
                        <span className="comms-sms-message-time">{formatCommsTime(message.createdAtMs)}</span>
                      </div>
                    ))}
                  </div>
                  <footer className="comms-sms-composer">
                    <TextField
                      value={state.composer}
                      onValueChange={state.setComposer}
                      placeholder="iMessage"
                      ariaLabel="SMS composer"
                    />
                    <TextButton label="Send" variant="primary" size="sm" onClick={() => void handleInlineSend()} />
                  </footer>
                </div>
              </div>
            </div>
            <CommsComposeFab ariaLabel="Compose SMS" onClick={() => setComposeOpen(true)} />
          </WorkspaceSurface>
        }
      />
      <ComposeSmsModal
        open={composeOpen}
        fromLabel={fromLabel}
        toValue={composeTo}
        bodyValue={composeBody}
        sending={sendingCompose}
        contacts={contactNumbers}
        onClose={() => setComposeOpen(false)}
        onToChange={setComposeTo}
        onBodyChange={setComposeBody}
        onSend={() => void handleSendCompose()}
        onInsertTo={(contact) => setComposeTo(`${contact.name} <${contact.address}>`)}
      />
      <ConfirmDialogModal
        open={pendingDeleteThreadId != null}
        title="Delete SMS Thread?"
        message="This will permanently remove the thread and all messages in it."
        confirmLabel={deletingThread ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        onCancel={() => {
          if (!deletingThread) {
            setPendingDeleteThreadId(null);
          }
        }}
        onConfirm={() => void handleConfirmDeleteThread()}
      />
    </section>
  );
}
