import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommsAccountRecord, CommsChannel, CommsMessageRecord, CommsThreadRecord } from '@agent-deck/runtime-client';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';

function isValidSmsAddress(value: string): boolean {
  return /^\+\d{8,15}$/.test(value.trim());
}

type UseCommsChannelStateInput = {
  channel: CommsChannel;
  folder?: string;
  activeOperatorId: string | null;
  activeOperatorName: string;
  activeOperatorEmailAddress?: string;
  createRequestNonce: number;
  newThreadTitle: string;
  newThreadSubject?: string;
};

export function useCommsChannelState(input: UseCommsChannelStateInput) {
  const {
    channel,
    folder,
    activeOperatorId,
    activeOperatorName,
    activeOperatorEmailAddress,
    createRequestNonce,
    newThreadTitle,
    newThreadSubject
  } = input;
  const runtimeClient = useRuntimeClient();
  const [accounts, setAccounts] = useState<CommsAccountRecord[]>([]);
  const [threads, setThreads] = useState<CommsThreadRecord[]>([]);
  const [messages, setMessages] = useState<CommsMessageRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastCreateNonce, setLastCreateNonce] = useState(0);

  const activeAccount = useMemo(
    () => accounts.find((account) => account.channel === channel) ?? accounts[0],
    [accounts, channel]
  );

  const desiredAddress = channel === 'email'
    ? activeOperatorEmailAddress || `${activeOperatorName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.local`
    : channel === 'chat'
      ? `${activeOperatorName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.chat@local.agentdeck`
      : '';

  const refreshAccounts = useCallback(async () => {
    if (!activeOperatorId) {
      setAccounts([]);
      return [];
    }
    const next = await runtimeClient.listCommsAccounts({ channel, operatorId: activeOperatorId });
    if (next.length > 0) {
      if (channel === 'sms') {
        const primary = next[0];
        if (!isValidSmsAddress(primary.address)) {
          const healed = await runtimeClient.upsertCommsAccount({
            accountId: primary.accountId,
            operatorId: activeOperatorId,
            channel,
            address: '',
            displayName: `${activeOperatorName} (${channel.toUpperCase()})`
          });
          const merged = [healed, ...next.slice(1)];
          setAccounts(merged);
          return merged;
        }
        setAccounts(next);
        return next;
      }
      const primary = next[0];
      if (primary.address !== desiredAddress) {
        const updated = await runtimeClient.upsertCommsAccount({
          accountId: primary.accountId,
          operatorId: activeOperatorId,
          channel,
          address: desiredAddress,
          displayName: `${activeOperatorName} (${channel.toUpperCase()})`
        });
        const merged = [updated, ...next.slice(1)];
        setAccounts(merged);
        return merged;
      }
      setAccounts(next);
      return next;
    }
    const created = await runtimeClient.upsertCommsAccount({
      accountId: `acct_${channel}_${activeOperatorId}`,
      operatorId: activeOperatorId,
      channel,
      address: channel === 'sms' ? '' : desiredAddress,
      displayName: `${activeOperatorName} (${channel.toUpperCase()})`
    });
    setAccounts([created]);
    return [created];
  }, [activeOperatorId, activeOperatorName, channel, desiredAddress, runtimeClient]);

  const refreshThreads = useCallback(
    async (accountId?: string) => {
      const next = await runtimeClient.listCommsThreads({
        channel,
        accountId: accountId || activeAccount?.accountId,
        folder,
        limit: 200
      });
      setThreads(next);
      if (!activeThreadId || !next.some((thread) => thread.threadId === activeThreadId)) {
        setActiveThreadId(next[0]?.threadId ?? null);
      }
    },
    [activeAccount?.accountId, activeThreadId, channel, folder, runtimeClient]
  );

  const refreshMessages = useCallback(async () => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    const next = await runtimeClient.listCommsMessages(activeThreadId, 500, 0);
    setMessages(next);
  }, [activeThreadId, runtimeClient]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const nextAccounts = await refreshAccounts();
        await refreshThreads(nextAccounts[0]?.accountId);
      } finally {
        setLoading(false);
      }
    })();
  }, [channel, folder, activeOperatorId, refreshAccounts, refreshThreads]);

  useEffect(() => {
    void refreshMessages();
  }, [activeThreadId, refreshMessages]);

  const createThread = useCallback(
    async (overrides?: { title?: string; subject?: string; participants?: unknown; folder?: string }) => {
      if (!activeAccount) {
        return null;
      }
      const thread = await runtimeClient.createCommsThread({
        channel,
        accountId: activeAccount.accountId,
        title: overrides?.title ?? newThreadTitle,
        subject: overrides?.subject ?? newThreadSubject,
        participants: overrides?.participants,
        folder: overrides?.folder ?? folder
      });
      await refreshThreads(activeAccount.accountId);
      setActiveThreadId(thread.threadId);
      return thread;
    },
    [activeAccount, channel, folder, newThreadSubject, newThreadTitle, refreshThreads, runtimeClient]
  );

  const appendMessage = useCallback(
    async (input: {
      threadId: string;
      bodyText: string;
      subject?: string;
      toParticipants?: unknown;
      ccParticipants?: unknown;
      bccParticipants?: unknown;
      direction?: string;
    }) => {
      if (!activeAccount || !input.bodyText.trim()) {
        return null;
      }
      const message = await runtimeClient.appendCommsMessage({
        threadId: input.threadId,
        direction: input.direction ?? 'outbound',
        fromAccountRef: activeAccount.address,
        bodyText: input.bodyText.trim(),
        subject: input.subject,
        toParticipants: input.toParticipants,
        ccParticipants: input.ccParticipants,
        bccParticipants: input.bccParticipants
      });
      await refreshMessages();
      await refreshThreads(activeAccount.accountId);
      return message;
    },
    [activeAccount, refreshMessages, refreshThreads, runtimeClient]
  );

  const updateThread = useCallback(
    async (threadId: string, patch: { title?: string; subject?: string; state?: string; folder?: string }) => {
      if (!activeAccount) {
        return null;
      }
      const thread = await runtimeClient.updateCommsThread(threadId, patch);
      await refreshThreads(activeAccount.accountId);
      return thread;
    },
    [activeAccount, refreshThreads, runtimeClient]
  );

  const deleteThread = useCallback(
    async (threadId: string) => {
      if (!activeAccount) {
        return;
      }
      await runtimeClient.deleteCommsThread(threadId);
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setMessages([]);
      }
      await refreshThreads(activeAccount.accountId);
    },
    [activeAccount, activeThreadId, refreshThreads, runtimeClient]
  );

  const handleCreateThread = useCallback(async () => {
    if (!activeAccount) {
      return;
    }
    await createThread();
  }, [activeAccount, createThread]);

  useEffect(() => {
    if (createRequestNonce <= lastCreateNonce) {
      return;
    }
    setLastCreateNonce(createRequestNonce);
    void handleCreateThread();
  }, [createRequestNonce, handleCreateThread, lastCreateNonce]);

  const handleSend = useCallback(async () => {
    if (!activeAccount || !activeThreadId || !composer.trim()) {
      return;
    }
    await appendMessage({
      threadId: activeThreadId,
      bodyText: composer.trim(),
      subject: newThreadSubject ? threads.find((thread) => thread.threadId === activeThreadId)?.subject : undefined
    });
    setComposer('');
  }, [activeAccount, activeThreadId, appendMessage, composer, newThreadSubject, threads]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.threadId === activeThreadId) ?? null,
    [activeThreadId, threads]
  );

  return {
    accounts,
    activeAccount,
    threads,
    messages,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    composer,
    setComposer,
    loading,
    createThread,
    appendMessage,
    updateThread,
    deleteThread,
    handleCreateThread,
    handleSend
  };
}

export function formatCommsTime(ms?: number) {
  if (!ms) {
    return 'No activity';
  }
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
