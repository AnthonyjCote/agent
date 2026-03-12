import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgentManifestStore, useOrgChartStore } from '../../../shared/config';
import {
  TextButton,
  TopRailShell,
  DropdownSelector,
  TopRailSelectorCard,
  OperatorSelectorModal
} from '../../../shared/ui';
import { DebugCardsPanel, buildRuntimeDebugCards } from '../../../shared/modules';
import { useDebugDomainState, type DebugOperatorRef } from '../model/useDebugDomainState';
import './DebugSurface.css';

const DEBUG_ACTIVE_OPERATOR_STORAGE_KEY = 'agent-deck.debug.active-operator-id';

type DebugTabId = 'run-lab' | 'tool-console' | 'state-inspector';

const TAB_OPTIONS: Array<{ id: DebugTabId; label: string }> = [
  { id: 'run-lab', label: 'Run Lab' },
  { id: 'tool-console', label: 'Tool Console' },
  { id: 'state-inspector', label: 'State Inspector' }
];

export function DebugSurface() {
  const [operatorPickerOpen, setOperatorPickerOpen] = useState(false);
  const { agents } = useAgentManifestStore();
  const { operators } = useOrgChartStore();

  const manifestById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);

  const displayOperators = useMemo<DebugOperatorRef[]>(() => {
    return operators.map((operator) => {
      const manifest = operator.sourceAgentId ? manifestById.get(operator.sourceAgentId) : undefined;
      return {
        id: operator.id,
        name: manifest?.name || operator.name,
        title: manifest?.role || operator.title,
        sourceAgentId: operator.sourceAgentId
      };
    });
  }, [manifestById, operators]);

  const [activeOperatorId, setActiveOperatorId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return displayOperators[0]?.id || '';
    }
    return window.localStorage.getItem(DEBUG_ACTIVE_OPERATOR_STORAGE_KEY) || displayOperators[0]?.id || '';
  });

  const activeOperator = useMemo(
    () => displayOperators.find((operator) => operator.id === activeOperatorId) || displayOperators[0] || null,
    [activeOperatorId, displayOperators]
  );

  useEffect(() => {
    if (!displayOperators.length) {
      return;
    }
    if (!activeOperatorId || !displayOperators.some((operator) => operator.id === activeOperatorId)) {
      const next = displayOperators[0].id;
      setActiveOperatorId(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DEBUG_ACTIVE_OPERATOR_STORAGE_KEY, next);
      }
    }
  }, [activeOperatorId, displayOperators]);

  const {
    activeTab,
    setActiveTab,
    runs,
    runsLoading,
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
  } = useDebugDomainState(activeOperator);

  const runtimeDebugCards = useMemo(() => {
    const events = (selectedRun?.runtimeEvents || []) as Array<Record<string, unknown>>;
    return buildRuntimeDebugCards(events, hideProviderEcho);
  }, [hideProviderEcho, selectedRun?.runtimeEvents]);

  const copyRaw = useCallback(async (raw: string) => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // noop
    }
  }, []);

  const handleSelectOperator = (operatorId: string) => {
    setActiveOperatorId(operatorId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEBUG_ACTIVE_OPERATOR_STORAGE_KEY, operatorId);
    }
    setOperatorPickerOpen(false);
  };

  return (
    <section className="debug-surface">
      <TopRailShell
        left={
          <div className="debug-top-left">
            <h2>Debug Workspace</h2>
            <div className="debug-top-tabs" role="tablist" aria-label="Debug tabs">
              {TAB_OPTIONS.map((tab) => (
                <TextButton
                  key={tab.id}
                  label={tab.label}
                  variant={activeTab === tab.id ? 'primary' : 'ghost'}
                  size="sm"
                  className={`debug-tab${activeTab === tab.id ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </div>
          </div>
        }
        right={
          <div className="debug-top-right">
            {activeTab === 'run-lab' ? (
              <TextButton label={runsLoading ? 'Refreshing...' : 'Refresh'} variant="ghost" onClick={() => void refreshRuns()} />
            ) : null}
            {activeTab === 'state-inspector' ? (
              <TextButton label={stateLoading ? 'Refreshing...' : 'Refresh'} variant="ghost" onClick={() => void refreshStateInspector()} />
            ) : null}
            <TopRailSelectorCard
              operatorId={activeOperator?.id}
              name={activeOperator?.name || 'Operator'}
              subtitle={activeOperator?.title || 'Role'}
              onClick={() => setOperatorPickerOpen(true)}
              ariaLabel="Select active debug operator"
            />
          </div>
        }
      />

      <div className="debug-content">
        {activeTab === 'run-lab' ? (
          <section className="debug-run-lab">
            <aside className="debug-runs-list">
              {runsLoading ? <div className="debug-empty">Loading runs...</div> : null}
              {!runsLoading && runs.length === 0 ? <div className="debug-empty">No runs found for this operator.</div> : null}
              {!runsLoading
                ? runs.map((run) => (
                    <button
                      key={run.runId}
                      type="button"
                      className={`debug-run-item${selectedRunId === run.runId ? ' is-active' : ''}`}
                      onClick={() => setSelectedRunId(run.runId)}
                    >
                      <span className="debug-run-id">{run.runId}</span>
                      <span className={`debug-run-status status-${run.status}`}>{run.status}</span>
                      <span className="debug-run-prompt">{run.prompt}</span>
                    </button>
                  ))
                : null}
            </aside>
            <div className="debug-run-detail">
              <div className="debug-run-meta">
                <span>Run: {selectedRun?.runId || 'none'}</span>
                <span>Status: {selectedRun?.status || 'idle'}</span>
                <span>Events: {selectedRun?.runtimeEvents.length || 0}</span>
              </div>
              <label className="debug-toggle">
                <input
                  type="checkbox"
                  checked={hideProviderEcho}
                  onChange={(event) => setHideProviderEcho(event.currentTarget.checked)}
                />
                <span>Hide provider user-echo duplicates</span>
              </label>
              <DebugCardsPanel
                runtimeCards={runtimeDebugCards}
                clientCards={[]}
                eventFilter={eventFilter}
                onEventFilterChange={setEventFilter}
                errorsOnly={errorsOnly}
                onErrorsOnlyChange={setErrorsOnly}
                onCopyRaw={copyRaw}
              />
            </div>
          </section>
        ) : null}

        {activeTab === 'tool-console' ? (
          <section className="debug-tool-console">
            <header>
              <h3>Tool Console</h3>
              <p>Manual tool invocation using runtime execution path and operator scope rules.</p>
            </header>
            <div className="debug-tool-controls">
              <DropdownSelector
                value={toolId}
                options={[
                  { value: 'org_manage_entities_v2', label: 'Org Chart Tool' },
                  { value: 'comms_tool', label: 'Comms Tool' }
                ]}
                onValueChange={(value) => setToolId(value as 'org_manage_entities_v2' | 'comms_tool')}
                ariaLabel="Select debug tool"
              />
              <TextButton
                label={toolRunning ? 'Executing...' : 'Execute'}
                variant={toolRunning ? 'ghost' : 'primary'}
                onClick={() => void runToolConsole()}
              />
            </div>
            <label className="debug-label">Args JSON</label>
            <textarea
              className="debug-json-input"
              value={toolArgsText}
              onChange={(event) => setToolArgsText(event.currentTarget.value)}
              spellCheck={false}
            />
            {toolError ? <p className="debug-error">{toolError}</p> : null}
            <label className="debug-label">Result</label>
            <pre className="debug-json-output">{toolResultRaw || '(no result yet)'}</pre>
          </section>
        ) : null}

        {activeTab === 'state-inspector' ? (
          <section className="debug-state-inspector">
            <header>
              <h3>State Inspector</h3>
              <p>Read-only snapshot for org and comms state tied to the selected operator.</p>
            </header>
            <pre className="debug-json-output">{stateSnapshotRaw || '(no snapshot loaded yet)'}</pre>
          </section>
        ) : null}
      </div>

      <OperatorSelectorModal
        open={operatorPickerOpen}
        options={displayOperators.map((operator) => ({
          id: operator.id,
          name: operator.name,
          title: operator.title
        }))}
        selectedId={activeOperator?.id ?? null}
        title="Select Operator"
        description="Choose which operator is active for debug actions and run inspection."
        ariaLabel="Select debug operator"
        size="large"
        onSelect={handleSelectOperator}
        onClose={() => setOperatorPickerOpen(false)}
      />
    </section>
  );
}
