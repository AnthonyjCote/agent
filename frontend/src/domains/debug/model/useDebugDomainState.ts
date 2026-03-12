import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RuntimeRunEvent } from '@agent-deck/runtime-client';
import { useRuntimeClient } from '@/app/runtime/RuntimeProvider';

type DebugTabId = 'run-lab' | 'tool-console' | 'state-inspector';

export type DebugRunRecord = {
  runId: string;
  threadId: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  runtimeEvents: RuntimeRunEvent[];
};

export type DebugOperatorRef = {
  id: string;
  name: string;
  title: string;
  sourceAgentId?: string | null;
};

function extractPromptFromRunEvents(events: RuntimeRunEvent[]): string {
  const request = events.find(
    (event) => event.event === 'debug_model_request' && typeof event.payload === 'string'
  );
  if (!request || typeof request.payload !== 'string') {
    return '';
  }
  const marker = 'User prompt:';
  const index = request.payload.indexOf(marker);
  if (index < 0) {
    return '';
  }
  const tail = request.payload.slice(index + marker.length).trimStart();
  return tail.split('\n')[0]?.trim() ?? '';
}

function resolveRunStatus(events: RuntimeRunEvent[]): DebugRunRecord['status'] {
  if (events.some((event) => event.event === 'run_failed')) {
    return 'failed';
  }
  if (events.some((event) => event.event === 'run_cancelled')) {
    return 'cancelled';
  }
  if (events.some((event) => event.event === 'run_completed')) {
    return 'completed';
  }
  return 'running';
}

function runTimestamp(runId: string): number {
  const match = /^run_(\d+)$/.exec(runId.trim());
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

export function useDebugDomainState(activeOperator: DebugOperatorRef | null) {
  const runtimeClient = useRuntimeClient();
  const [activeTab, setActiveTab] = useState<DebugTabId>('run-lab');
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<DebugRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [hideProviderEcho, setHideProviderEcho] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');
  const [errorsOnly, setErrorsOnly] = useState(false);

  const [toolId, setToolId] = useState<'org_manage_entities_v2' | 'comms_tool'>('org_manage_entities_v2');
  const [toolArgsText, setToolArgsText] = useState<string>('{}');
  const [toolRunning, setToolRunning] = useState(false);
  const [toolResultRaw, setToolResultRaw] = useState<string>('');
  const [toolError, setToolError] = useState<string>('');

  const [stateLoading, setStateLoading] = useState(false);
  const [stateSnapshotRaw, setStateSnapshotRaw] = useState<string>('');

  const selectedRun = useMemo(
    () => (selectedRunId ? runs.find((run) => run.runId === selectedRunId) || null : runs[0] || null),
    [runs, selectedRunId]
  );

  const refreshRuns = useCallback(async () => {
    if (!activeOperator?.sourceAgentId) {
      setRuns([]);
      setSelectedRunId(null);
      return;
    }
    setRunsLoading(true);
    try {
      const threads = await runtimeClient.listThreads({
        operatorId: activeOperator.sourceAgentId,
        status: 'active',
        limit: 100,
        offset: 0
      });
      const runEntries = await Promise.all(
        threads.map(async (thread) => {
          const runIds = await runtimeClient.listThreadRunIds(thread.threadId, 60);
          const runRecords = await Promise.all(
            runIds.map(async (runId) => {
              const events = await runtimeClient.listRunEvents(runId);
              const prompt = extractPromptFromRunEvents(events) || thread.summary || thread.title || '(no prompt)';
              return {
                runId,
                threadId: thread.threadId,
                prompt,
                status: resolveRunStatus(events),
                runtimeEvents: events
              } as DebugRunRecord;
            })
          );
          return runRecords;
        })
      );

      const flattened = runEntries
        .flat()
        .sort((a, b) => runTimestamp(b.runId) - runTimestamp(a.runId));
      setRuns(flattened);
      setSelectedRunId((current) => {
        if (current && flattened.some((run) => run.runId === current)) {
          return current;
        }
        return flattened[0]?.runId ?? null;
      });
    } finally {
      setRunsLoading(false);
    }
  }, [activeOperator?.sourceAgentId, runtimeClient]);

  const runToolConsole = useCallback(async () => {
    setToolError('');
    setToolRunning(true);
    try {
      const parsed = JSON.parse(toolArgsText || '{}') as Record<string, unknown>;
      const result = await runtimeClient.executeDebugTool({
        toolId,
        args: parsed,
        operatorId: activeOperator?.id,
        operatorName: activeOperator?.name
      });
      setToolResultRaw(JSON.stringify(result, null, 2));
      if (!result.ok) {
        setToolError(result.error?.message || 'Debug tool execution failed.');
      }
    } catch (error) {
      setToolError(error instanceof Error ? error.message : 'Invalid JSON or runtime error.');
      setToolResultRaw('');
    } finally {
      setToolRunning(false);
    }
  }, [activeOperator?.id, activeOperator?.name, runtimeClient, toolArgsText, toolId]);

  const refreshStateInspector = useCallback(async () => {
    setStateLoading(true);
    try {
      const orgState = await runtimeClient.getOrgChartState();
      const accounts = activeOperator?.sourceAgentId
        ? await runtimeClient.listCommsAccounts({ operatorId: activeOperator.sourceAgentId })
        : [];
      const threadsByAccount = await Promise.all(
        accounts.map(async (account) => {
          const threads = await runtimeClient.listCommsThreads({ accountId: account.accountId, limit: 200, offset: 0 });
          return { account, threads };
        })
      );
      setStateSnapshotRaw(
        JSON.stringify(
          {
            operator: activeOperator,
            orgState,
            comms: {
              accounts,
              threadsByAccount
            }
          },
          null,
          2
        )
      );
    } finally {
      setStateLoading(false);
    }
  }, [activeOperator, runtimeClient]);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  return {
    activeTab,
    setActiveTab,
    runsLoading,
    runs,
    selectedRun,
    selectedRunId,
    setSelectedRunId,
    hideProviderEcho,
    setHideProviderEcho,
    eventFilter,
    setEventFilter,
    errorsOnly,
    setErrorsOnly,
    refreshRuns,
    toolId,
    setToolId,
    toolArgsText,
    setToolArgsText,
    toolRunning,
    toolResultRaw,
    toolError,
    runToolConsole,
    stateLoading,
    stateSnapshotRaw,
    refreshStateInspector
  };
}
