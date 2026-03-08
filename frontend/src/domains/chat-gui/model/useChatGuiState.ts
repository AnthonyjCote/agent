/**
 * Purpose: Manage local chat-gui surface state for composer and message history.
 * Responsibilities:
 * - Hold active agent metadata for chat context.
 * - Track draft prompt and message timeline state.
 * - Route draft submission through assistant response generation seam.
 */
// @tags: domain,chat-gui,model,state
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

import { useRef, useState } from 'react';
import type {
  AgentRuntimeClient,
  ChatThreadMessageRecord,
  ChatThreadSummary,
  RuntimeRunEvent
} from '@agent-deck/runtime-client';
import { type ActiveAgent, type ChatMessage, type SearchQueryLink } from '../lib';

const WORKSPACE_ID = 'ws_local_v1';
const FINAL_RESPONSE_SENTINEL = '[[FINAL_RESPONSE]]';

type RunDebugStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type RunDebugRecord = {
  runId: string;
  threadId: string;
  startedAt: number;
  prompt: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  status: RunDebugStatus;
  clientDebugEvents: RuntimeRunEvent[];
  runtimeEvents: RuntimeRunEvent[];
};

function resolveRunStatus(events: RuntimeRunEvent[], fallback: RunDebugStatus = 'running'): RunDebugStatus {
  if (events.some((event) => event.event === 'run_failed')) {
    return 'failed';
  }
  if (events.some((event) => event.event === 'run_cancelled')) {
    return 'cancelled';
  }
  if (events.some((event) => event.event === 'run_completed')) {
    return 'completed';
  }
  return fallback;
}

function buildAssistantContent(events: RuntimeRunEvent[]): string {
  const lines: string[] = [];

  for (const event of events) {
    if (event.event === 'blocks_produced') {
      const blocks = Array.isArray(event.blocks) ? event.blocks : [];
      for (const block of blocks) {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          (block as Record<string, unknown>).type === 'assistant_text'
        ) {
          const text = (block as Record<string, unknown>).text;
          if (typeof text === 'string' && text.trim()) {
            lines.push(text.trim());
          }
        }
      }
    }

    if (event.event === 'run_failed' && event.error && typeof event.error === 'object') {
      const message = (event.error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) {
        return `Run failed: ${message.trim()}`;
      }
    }
  }

  if (lines.length === 0) {
    const debugResponse = events.find(
      (event) => event.event === 'debug_model_response' && typeof event.payload === 'string' && event.payload.trim()
    );
    if (debugResponse && typeof debugResponse.payload === 'string') {
      return `No assistant output blocks were produced.\n\nLast model payload:\n${debugResponse.payload}`;
    }

    return 'No assistant output was produced for this run.';
  }

  return lines.join('\n\n');
}

function buildSearchQueryLinks(events: RuntimeRunEvent[]): SearchQueryLink[] {
  const map = new Map<string, SearchQueryLink>();

  for (const event of events) {
    if (event.event !== 'debug_model_stream_line' || typeof event.line !== 'string') {
      continue;
    }
    const raw = event.line.trim();
    if (!raw.startsWith('{') || !raw.endsWith('}')) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (type !== 'tool_use') {
        continue;
      }
      const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name.trim() : '';
      if (toolName !== 'google_web_search') {
        continue;
      }
      const parameters =
        parsed.parameters && typeof parsed.parameters === 'object'
          ? (parsed.parameters as Record<string, unknown>)
          : null;
      const query = parameters && typeof parameters.query === 'string' ? parameters.query.trim() : '';
      if (!query) {
        continue;
      }
      if (!map.has(query)) {
        map.set(query, {
          query,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
        });
      }
    } catch {
      // Ignore non-JSON and partial stream chunks.
    }
  }

  return Array.from(map.values());
}

function resolveAssistantPendingStatus(events: RuntimeRunEvent[]): string {
  if (events.some((event) => event.event === 'run_failed')) {
    return 'Run failed';
  }

  const parseStreamJson = (line: string): Record<string, unknown> | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const isSearchTool = (toolName: string): boolean => {
    const normalized = toolName.trim().toLowerCase();
    return normalized === 'google_web_search' || normalized.includes('search');
  };

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }

    if (event.event === 'debug_model_request' && typeof event.phase === 'string') {
      const phase = event.phase;
      if (phase === 'deep_default' || phase === 'deep_escalate' || phase === 'agent_loop') {
        return 'Thinking...';
      }
      if (phase === 'ack_stage') {
        return 'Receiving...';
      }
    }

    if (event.event === 'model_delta' && typeof event.text === 'string' && event.text.trim()) {
      return 'Typing...';
    }

    if (event.event === 'debug_model_stream_line' && typeof event.line === 'string') {
      const parsed = parseStreamJson(event.line);
      if (!parsed) {
        continue;
      }
      const type = typeof parsed.type === 'string' ? parsed.type : '';
      if (type === 'message') {
        const role = typeof parsed.role === 'string' ? parsed.role : '';
        const content = typeof parsed.content === 'string' ? parsed.content : '';
        if (role === 'assistant' && content.trim()) {
          return 'Typing...';
        }
      }
      if (type === 'tool_use') {
        const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : '';
        return isSearchTool(toolName) ? 'Researching...' : 'Working...';
      }
      if (type === 'tool_result') {
        const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : '';
        return isSearchTool(toolName) ? 'Analyzing...' : 'Working...';
      }
    }

    if (event.event === 'tool_use' && event.lifecycle === 'dispatched') {
      const toolName = typeof event.tool_name === 'string' ? event.tool_name : '';
      return isSearchTool(toolName) ? 'Researching...' : 'Working...';
    }
    if (event.event === 'tool_result' && event.lifecycle === 'completed') {
      const toolName = typeof event.tool_name === 'string' ? event.tool_name : '';
      return isSearchTool(toolName) ? 'Analyzing...' : 'Working...';
    }
  }

  const hasStreamLine = events.some((event) => event.event === 'debug_model_stream_line');
  const hasModelRequest = events.some((event) => event.event === 'debug_model_request');
  if (hasModelRequest && !hasStreamLine) {
    return 'Receiving...';
  }
  if (hasModelRequest && hasStreamLine) {
    return 'Thinking...';
  }

  const hasStarted = events.some((event) => event.event === 'run_started');
  if (hasStarted) {
    return 'Receiving...';
  }

  return 'Connecting...';
}

function resolvePendingAssistantState(events: RuntimeRunEvent[]): {
  status: string;
  reasoning: string;
  responseDraft: string;
} {
  const humanizeToolName = (raw: string): string =>
    raw
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const summarizeToolUse = (toolName: string, params: Record<string, unknown> | null): string => {
    const label = humanizeToolName(toolName || 'tool');
    if (!params) {
      return `Using ${label}`;
    }

    if (typeof params.query === 'string' && params.query.trim()) {
      return `Using ${label}: “${params.query.trim()}”`;
    }

    if (typeof params.location === 'string' && params.location.trim()) {
      return `Using ${label}: ${params.location.trim()}`;
    }

    return `Using ${label}`;
  };

  const reasoningToolLines: string[] = [];
  let reasoningText = '';
  let responseDraft = '';
  let postSentinel = false;
  let sentinelCarry = '';

  for (const event of events) {
    if (event.event === 'debug_model_stream_line' && typeof event.line === 'string') {
      const raw = event.line.trim();
      if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const type = typeof parsed.type === 'string' ? parsed.type : '';
          if (type === 'tool_use') {
            const toolName =
              typeof parsed.tool_name === 'string' && parsed.tool_name.trim() ? parsed.tool_name.trim() : 'tool';
            const params =
              parsed.parameters && typeof parsed.parameters === 'object'
                ? (parsed.parameters as Record<string, unknown>)
                : null;
            reasoningToolLines.push(summarizeToolUse(toolName, params));
          } else if (type === 'tool_result') {
            const toolName =
              typeof parsed.tool_name === 'string' && parsed.tool_name.trim() ? parsed.tool_name.trim() : '';
            const toolId = typeof parsed.tool_id === 'string' ? parsed.tool_id : 'tool';
            const status = typeof parsed.status === 'string' ? parsed.status : 'success';
            const output = typeof parsed.output === 'string' ? parsed.output.trim() : '';
            const label = humanizeToolName(toolName || toolId);
            if (status === 'error') {
              reasoningToolLines.push(`Failed ${label}`);
            } else {
              reasoningToolLines.push(output || `Completed ${label}`);
            }
          }
        } catch {
          // Ignore non-JSON or partial debug lines.
        }
      }
    }

    if (event.event === 'tool_use' && event.lifecycle === 'dispatched') {
      const toolName = typeof event.tool_name === 'string' && event.tool_name.trim() ? event.tool_name.trim() : 'tool';
      reasoningToolLines.push(`Using ${humanizeToolName(toolName)}`);
      continue;
    }

    if (event.event === 'tool_result') {
      const toolName = typeof event.tool_name === 'string' && event.tool_name.trim() ? event.tool_name.trim() : 'tool';
      const lifecycle = typeof event.lifecycle === 'string' ? event.lifecycle : 'completed';
      if (lifecycle === 'failed') {
        reasoningToolLines.push(`Failed ${humanizeToolName(toolName)}`);
      } else if (lifecycle === 'completed') {
        reasoningToolLines.push(`Completed ${humanizeToolName(toolName)}`);
      }
      continue;
    }

    if (event.event !== 'model_delta' || typeof event.text !== 'string') {
      continue;
    }

    const phase = typeof event.phase === 'string' ? event.phase : '';
    const chunk = event.text;
    if (!chunk) {
      continue;
    }

    if (phase === 'planner' || phase === 'planner_details') {
      const cleaned = chunk.trim();
      if (cleaned) {
        reasoningText += (reasoningText ? '\n' : '') + cleaned;
      }
      continue;
    }

    if (phase === 'ack_stage') {
      responseDraft += chunk;
      continue;
    }

    if (
      phase !== 'synthesis' &&
      phase !== 'direct' &&
      phase !== 'agent_loop' &&
      phase !== 'deep_default' &&
      phase !== 'deep_escalate'
    ) {
      continue;
    }

    if (!postSentinel) {
      sentinelCarry += chunk;
      const markerIndex = sentinelCarry.indexOf(FINAL_RESPONSE_SENTINEL);
      if (markerIndex >= 0) {
        const preamble = sentinelCarry.slice(0, markerIndex);
        if (preamble) {
          reasoningText += preamble;
        }
        responseDraft += sentinelCarry.slice(markerIndex + FINAL_RESPONSE_SENTINEL.length);
        sentinelCarry = '';
        postSentinel = true;
      } else {
        // Stream reasoning immediately while preserving enough tail to detect
        // sentinel token that may arrive split across chunk boundaries.
        const keepTail = FINAL_RESPONSE_SENTINEL.length - 1;
        if (sentinelCarry.length > keepTail) {
          const flushLen = sentinelCarry.length - keepTail;
          reasoningText += sentinelCarry.slice(0, flushLen);
          sentinelCarry = sentinelCarry.slice(flushLen);
        }
      }
      continue;
    }

    responseDraft += chunk;
  }

  const reasoningBody = (postSentinel ? reasoningText : reasoningText + sentinelCarry)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const toolsBody = reasoningToolLines.join('\n').trim();
  const reasoning = [reasoningBody, toolsBody].filter((part) => part.length > 0).join('\n\n');

  return {
    status: resolveAssistantPendingStatus(events),
    reasoning: reasoning.length > 1200 ? reasoning.slice(reasoning.length - 1200).trimStart() : reasoning,
    responseDraft
  };
}

export function useChatGuiState(runtimeClient: AgentRuntimeClient) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const selectedThreadByOperatorRef = useRef<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<RuntimeRunEvent[]>([]);
  const [clientDebugEvents, setClientDebugEvents] = useState<RuntimeRunEvent[]>([]);
  const [debugRuns, setDebugRuns] = useState<RunDebugRecord[]>([]);
  const [selectedDebugRunId, setSelectedDebugRunId] = useState<string | null>(null);

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const toChatMessage = (
    record: ChatThreadMessageRecord,
    activeAgent: ActiveAgent
  ): ChatMessage => ({
    id: record.messageId,
    role: record.role === 'assistant' ? 'assistant' : 'user',
    content: record.content,
    createdAt: record.createdAtMs,
    agentName: record.role === 'assistant' ? activeAgent.name : undefined,
    agentRole: record.role === 'assistant' ? activeAgent.role : undefined,
    avatarUrl: record.role === 'assistant' ? activeAgent.avatarUrl : undefined
  });

  const refreshThreads = async (activeAgent?: ActiveAgent, search?: string) => {
    setThreadsLoading(true);
    try {
      const listed = await runtimeClient.listThreads({
        operatorId: activeAgent?.id,
        status: 'active',
        search: search?.trim() || undefined,
        limit: 200,
        offset: 0
      });
      setThreads(listed);
      return listed;
    } finally {
      setThreadsLoading(false);
    }
  };

  const loadThreadMessages = async (threadId: string, activeAgent: ActiveAgent) => {
    const rows = await runtimeClient.listThreadMessages(threadId, 500, 0);
    setMessages(rows.map((row) => toChatMessage(row, activeAgent)));
  };

  const activateAgent = async (activeAgent: ActiveAgent) => {
    const listed = await refreshThreads();
    const agentThreads = listed.filter((thread) => thread.operatorId === activeAgent.id);
    let threadId = selectedThreadByOperatorRef.current[activeAgent.id] ?? null;
    if (!threadId || !agentThreads.some((thread) => thread.threadId === threadId)) {
      threadId = agentThreads[0]?.threadId ?? null;
    }
    setActiveThreadId(threadId);
    if (!threadId) {
      setMessages([]);
      return;
    }
    selectedThreadByOperatorRef.current[activeAgent.id] = threadId;
    await loadThreadMessages(threadId, activeAgent);
  };

  const openThread = async (threadId: string, activeAgent: ActiveAgent) => {
    selectedThreadByOperatorRef.current[activeAgent.id] = threadId;
    setActiveThreadId(threadId);
    await loadThreadMessages(threadId, activeAgent);
  };

  const createThread = async (activeAgent: ActiveAgent, title?: string) => {
    const created = await runtimeClient.createThread({
      operatorId: activeAgent.id,
      title: title?.trim() || undefined
    });
    const listed = await refreshThreads();
    selectedThreadByOperatorRef.current[activeAgent.id] = created.threadId;
    setActiveThreadId(created.threadId);
    setThreads(listed);
    setMessages([]);
    return created;
  };

  const deleteThread = async (threadId: string, activeAgent: ActiveAgent) => {
    await runtimeClient.deleteThread(threadId);
    const listed = await refreshThreads();
    const agentThreads = listed.filter((thread) => thread.operatorId === activeAgent.id);
    const nextThreadId = agentThreads[0]?.threadId ?? null;
    if (nextThreadId) {
      selectedThreadByOperatorRef.current[activeAgent.id] = nextThreadId;
      setActiveThreadId(nextThreadId);
      await loadThreadMessages(nextThreadId, activeAgent);
    } else {
      delete selectedThreadByOperatorRef.current[activeAgent.id];
      setActiveThreadId(null);
      setMessages([]);
    }
  };
  const resolveAllowedToolIds = (toolsPolicyRef?: string): string[] => {
    const defaultTools = ['weather_open_meteo', 'org_manage_entities_v2'];
    if (toolsPolicyRef === 'policy_default') {
      return defaultTools;
    }
    return defaultTools;
  };
  const updatePendingAssistantMessage = (
    runId: string,
    content: string,
    isPending: boolean,
    pendingReasoning?: string,
    searchQueries?: SearchQueryLink[],
    pendingStatus?: string
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.role === 'assistant' && message.runId === runId
          ? {
              ...message,
              content,
              isPending,
              pendingStatus: pendingStatus || '',
              pendingReasoning: pendingReasoning || '',
              searchQueries: searchQueries || []
            }
          : message
      )
    );
  };

  const upsertDebugRun = (runId: string, updater: (existing: RunDebugRecord) => RunDebugRecord) => {
    setDebugRuns((current) => current.map((record) => (record.runId === runId ? updater(record) : record)));
  };

  const fetchRunEventsUntilDone = async (runId: string): Promise<RuntimeRunEvent[]> => {
    const maxAttempts = 600;
    const intervalMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const events = await runtimeClient.listRunEvents(runId);
      setRunEvents(events);
      const pendingState = resolvePendingAssistantState(events);
      updatePendingAssistantMessage(runId, pendingState.responseDraft, true, pendingState.reasoning, undefined, pendingState.status);
      upsertDebugRun(runId, (record) => ({
        ...record,
        runtimeEvents: events,
        status: resolveRunStatus(events, 'running')
      }));

      const hasTerminalEvent = events.some(
        (event) => event.event === 'run_completed' || event.event === 'run_failed' || event.event === 'run_cancelled'
      );

      if (hasTerminalEvent) {
        return events;
      }

      await wait(intervalMs);
    }

    const terminal = await runtimeClient.listRunEvents(runId);
    const hasTerminalEvent = terminal.some(
      (event) => event.event === 'run_completed' || event.event === 'run_failed' || event.event === 'run_cancelled'
    );
    const resolved = hasTerminalEvent
      ? terminal
      : [
          ...terminal,
          {
            event: 'run_failed',
            runId,
            error: {
              code: 'client_poll_timeout',
              message: 'Timed out while waiting for runtime terminal event.',
              retryable: true
            }
          }
        ];
    const timeoutEvent: RuntimeRunEvent = {
      event: 'client_poll_timeout',
      runId,
      message: 'Reached polling timeout before terminal run event.'
    };

    setRunEvents(resolved);
    const pendingState = resolvePendingAssistantState(resolved);
    updatePendingAssistantMessage(runId, pendingState.responseDraft, true, pendingState.reasoning, undefined, pendingState.status);
    setClientDebugEvents((current) => [...current, timeoutEvent]);
    upsertDebugRun(runId, (record) => ({
      ...record,
      runtimeEvents: resolved,
      clientDebugEvents: [...record.clientDebugEvents, timeoutEvent],
      status: resolveRunStatus(resolved, 'failed')
    }));

    return resolved;
  };

  const submitDraft = async (activeAgent: ActiveAgent) => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    let threadId = activeThreadId;
    if (!threadId) {
      const created = await createThread(activeAgent);
      threadId = created.threadId;
    }
    if (!threadId) {
      return;
    }

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `user-${now}`,
      role: 'user',
      content,
      createdAt: now
    };

    const runId = `run_${now}`;
    const pendingAssistantId = `assistant-pending-${runId}`;
    const startPayloadEvent: RuntimeRunEvent = {
      event: 'client_start_run_payload',
      workspaceId: WORKSPACE_ID,
      runId,
      threadId,
      agentId: activeAgent.id,
      agentName: activeAgent.name,
      agentRole: activeAgent.role || 'General Assistant'
    };

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: pendingAssistantId,
        role: 'assistant',
        runId,
        isPending: true,
        content: '',
        pendingStatus: 'Connecting...',
        createdAt: now + 1,
        pendingReasoning: '',
        agentName: activeAgent.name,
        agentRole: activeAgent.role,
        avatarUrl: activeAgent.avatarUrl
      }
    ]);
    setDraft('');
    setIsRunning(true);
    setRunEvents([]);
    setClientDebugEvents([startPayloadEvent]);
    setActiveRunId(runId);
    setSelectedDebugRunId(runId);
    setDebugRuns((current) => [
      {
        runId,
        threadId,
        startedAt: now,
        prompt: content,
        agentId: activeAgent.id,
        agentName: activeAgent.name,
        agentRole: activeAgent.role || 'General Assistant',
        status: 'running',
        clientDebugEvents: [startPayloadEvent],
        runtimeEvents: []
      },
      ...current.filter((record) => record.runId !== runId)
    ]);

    try {
      await runtimeClient.appendThreadMessage({
        threadId,
        role: 'user',
        content
      });
      const started = await runtimeClient.startRun({
        workspaceId: WORKSPACE_ID,
        runId,
        threadId,
        agentId: activeAgent.id,
        agentName: activeAgent.name,
        agentRole: activeAgent.role || 'General Assistant',
        agentBusinessUnitName: activeAgent.businessUnitName || '',
        agentOrgUnitName: activeAgent.orgUnitName || '',
        agentPrimaryObjective: activeAgent.primaryObjective || '',
        systemDirectiveShort: activeAgent.systemDirectiveShort || 'Be concise, clear, and helpful.',
        sender: 'user',
        recipient: activeAgent.id,
        message: content,
        allowedToolIds: resolveAllowedToolIds(activeAgent.toolsPolicyRef)
      });
      const startResponseEvent: RuntimeRunEvent = {
        event: 'client_start_run_response',
        runId: started.runId
      };
      setClientDebugEvents((current) => [...current, startResponseEvent]);
      upsertDebugRun(runId, (record) => ({
        ...record,
        clientDebugEvents: [...record.clientDebugEvents, startResponseEvent]
      }));

      const events = await fetchRunEventsUntilDone(started.runId);
      upsertDebugRun(runId, (record) => ({
        ...record,
        runtimeEvents: events,
        status: resolveRunStatus(events, record.status)
      }));

      const finalContent = buildAssistantContent(events);
      await runtimeClient.appendThreadMessage({
        threadId,
        role: 'assistant',
        content: finalContent
      });
      updatePendingAssistantMessage(runId, finalContent, false, '', buildSearchQueryLinks(events), '');
      void refreshThreads();
    } catch (error) {
      const runtimeErrorEvent: RuntimeRunEvent = {
        event: 'client_runtime_error',
        runId,
        message: error instanceof Error ? error.message : 'Unknown runtime client error'
      };
      setClientDebugEvents((current) => [...current, runtimeErrorEvent]);
      upsertDebugRun(runId, (record) => ({
        ...record,
        clientDebugEvents: [...record.clientDebugEvents, runtimeErrorEvent],
        status: 'failed'
      }));
      const fallback: ChatMessage = {
        id: pendingAssistantId,
        role: 'assistant',
        runId,
        isPending: false,
        pendingStatus: '',
        content: `Runtime request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createdAt: Date.now(),
        agentName: activeAgent.name,
        agentRole: activeAgent.role,
        avatarUrl: activeAgent.avatarUrl
      };
      setMessages((current) =>
        current.map((message) =>
          message.role === 'assistant' && message.runId === runId ? fallback : message
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  return {
    messages,
    threads,
    activeThreadId,
    threadsLoading,
    draft,
    isRunning,
    activeRunId,
    runEvents,
    clientDebugEvents,
    debugRuns,
    selectedDebugRunId,
    setSelectedDebugRunId,
    setDraft,
    submitDraft,
    activateAgent,
    openThread,
    createThread,
    deleteThread,
    refreshThreads
  };
}
