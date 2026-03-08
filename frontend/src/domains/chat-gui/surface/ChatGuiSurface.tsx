/**
 * Purpose: Compose the chat-gui route surface using shared chat and avatar shells.
 * Responsibilities:
 * - Render centered empty-state chat entry when no history exists.
 * - Render thread+docked composer layout when conversation history exists.
 * - Render user and assistant messages with role-specific visual separation.
 */
// @tags: domain,chat-gui,surface,layout
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AgentManifest, useAgentManifestStore } from '../../../shared/config/agents';
import { useOrgChartStore } from '../../../shared/config/org-chart';
import { AgentManifestModal } from '../../../shared/modules';
import {
  AgentAvatar,
  AgentGrid,
  CenteredEmptyState,
  ChatComposerShell,
  MessageThreadShell,
  ModalTopRail,
  ModalShell,
  ConfirmDialogModal,
  TextButton,
  TextField,
  DropdownSelector
} from '../../../shared/ui';
import type { SearchQueryLink } from '../lib';
import { useChatGuiStore } from '../model/ChatGuiStoreProvider';
import './ChatGuiSurface.css';

const ACTIVE_AGENT_STORAGE_KEY = 'agent-deck:chat:active-agent-id';

type CitationSource = {
  index: string;
  title: string;
  domain?: string;
  url: string;
};

type MarkdownTable = {
  header: string[];
  rows: string[][];
};

function parseAssistantContentWithSources(content: string): {
  body: string;
  sources: Record<string, CitationSource>;
} {
  const normalized = content.replace(/\r\n/g, '\n');
  const blockMatch = /(?:^|\n)\s*(?:\*\*)?Sources(?:\*\*)?\s*:\s*\n([\s\S]*)$/i.exec(normalized);
  const inlineMatch = /(?:^|\n)\s*(?:\*\*)?Sources(?:\*\*)?\s*:\s*(.+)$/i.exec(normalized);
  const match = blockMatch ?? inlineMatch;
  if (!match || typeof match.index !== 'number') {
    return { body: normalized, sources: {} };
  }

  const body = normalized.slice(0, match.index).trim();
  const sourceBlock = match[1];
  const compactEntries = sourceBlock
    .trim()
    .split(/\s+(?=\[\d+\]\s)/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const lines = sourceBlock
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const entries = lines.length > 1 ? lines : compactEntries;
  const sources: Record<string, CitationSource> = {};

  for (const rawLine of entries) {
    const line = rawLine.replace(/^[-*]\s+/, '').trim();
    const pipeMatch = /^\[(\d+)\]\s+(.+?)\s+\|\s+(.+?)\s+\|\s+(https?:\/\/\S+)$/.exec(line);
    if (pipeMatch) {
      const [, index, title, domain, rawUrl] = pipeMatch;
      const url = rawUrl.trim().replace(/[",]+$/, '');
      sources[index] = { index, title: title.trim(), domain: domain.trim(), url };
      continue;
    }

    const twoFieldPipeMatch = /^\[(\d+)\]\s+(.+?)\s+\|\s+(https?:\/\/\S+)$/.exec(line);
    if (twoFieldPipeMatch) {
      const [, index, domainLike, rawUrl] = twoFieldPipeMatch;
      const domain = domainLike.trim();
      const url = rawUrl.trim().replace(/[",]+$/, '');
      sources[index] = { index, title: domain, domain, url };
      continue;
    }

    const markdownMatch = /^\[(\d+)\]\s+\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(line);
    if (markdownMatch) {
      const [, index, title, rawUrl] = markdownMatch;
      const url = rawUrl.trim().replace(/[",]+$/, '');
      sources[index] = { index, title: title.trim(), url };
      continue;
    }

    const plainMatch = /^\[(\d+)\]\s+(.+?)\s+[—-]\s+(https?:\/\/\S+)$/.exec(line);
    if (plainMatch) {
      const [, index, title, rawUrl] = plainMatch;
      const url = rawUrl.trim().replace(/[",]+$/, '');
      sources[index] = { index, title: title.trim(), url };
    }
  }

  return { body: body || normalized, sources };
}

function CitationRef({
  source,
  onOpen
}: {
  source: CitationSource;
  onOpen: (source: CitationSource) => void;
}) {
  return (
    <button type="button" className="chat-gui-citation-ref" onClick={() => onOpen(source)}>
      [{source.index}]
      <span className="chat-gui-citation-popover">
        <span className="chat-gui-citation-title">{source.title}</span>
        <span className="chat-gui-citation-url">{source.domain || source.url}</span>
      </span>
    </button>
  );
}

function renderInlineMarkdown(
  text: string,
  sources: Record<string, CitationSource>,
  onOpenCitation: (source: CitationSource) => void
): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return segments.map((segment, index) => {
    const citationMatch = /^\[(\d+)\]$/.exec(segment);
    if (citationMatch) {
      const source = sources[citationMatch[1]];
      if (source) {
        return <CitationRef key={`cite-${index}`} source={source} onOpen={onOpenCitation} />;
      }
      return <span key={`cite-missing-${index}`}>{segment}</span>;
    }

    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={`bold-${index}`}>{segment.slice(2, -2)}</strong>;
    }
    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function parseMarkdownTable(lines: string[], startIndex: number): { table: MarkdownTable; consumed: number } | null {
  const headerLine = lines[startIndex]?.trim() || '';
  const separatorLine = lines[startIndex + 1]?.trim() || '';
  if (!headerLine.includes('|') || !separatorLine.includes('|')) {
    return null;
  }

  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter((_, index, arr) => !(index === 0 && arr[0] === '') && !(index === arr.length - 1 && arr[arr.length - 1] === ''));

  const header = parseRow(headerLine);
  const separator = parseRow(separatorLine);
  if (!header.length || separator.length !== header.length) {
    return null;
  }
  const validSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!validSeparator) {
    return null;
  }

  const rows: string[][] = [];
  let consumed = 2;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    const rowLine = lines[index].trim();
    if (!rowLine || !rowLine.includes('|')) {
      break;
    }
    const row = parseRow(rowLine);
    if (row.length !== header.length) {
      break;
    }
    rows.push(row);
    consumed += 1;
  }

  if (!rows.length) {
    return null;
  }

  return { table: { header, rows }, consumed };
}

function normalizeInlineMarkdownTable(body: string): string {
  const separatorRegex = /(\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*){1,})/;
  const separatorMatch = separatorRegex.exec(body);
  if (!separatorMatch || typeof separatorMatch.index !== 'number') {
    return body;
  }

  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter((_, index, arr) => !(index === 0 && arr[0] === '') && !(index === arr.length - 1 && arr[arr.length - 1] === ''));

  const separatorText = separatorMatch[1].trim();
  const separatorCols = parseRow(separatorText);
  if (separatorCols.length < 2) {
    return body;
  }

  const prefix = body.slice(0, separatorMatch.index);
  const suffix = body.slice(separatorMatch.index + separatorMatch[1].length);
  const headerLineCandidate = prefix
    .split('\n')
    .pop()
    ?.split(':')
    .pop()
    ?.trim();
  if (!headerLineCandidate || !headerLineCandidate.includes('|')) {
    return body;
  }
  const headerCols = parseRow(headerLineCandidate);
  if (headerCols.length !== separatorCols.length) {
    return body;
  }

  const sourcesIndex = suffix.search(/\bSources:\b/i);
  const tableRowsRaw = sourcesIndex >= 0 ? suffix.slice(0, sourcesIndex) : suffix;
  const remainder = sourcesIndex >= 0 ? suffix.slice(sourcesIndex) : '';
  const rowStartRegex = /\b[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,2}\s+\|/g;
  const rowStarts: number[] = [];
  for (const match of tableRowsRaw.matchAll(rowStartRegex)) {
    const index = match.index;
    if (typeof index !== 'number') {
      continue;
    }
    if (rowStarts.length === 0 || rowStarts[rowStarts.length - 1] !== index) {
      rowStarts.push(index);
    }
  }
  if (!rowStarts.length) {
    return body;
  }
  const rowLines: string[] = [];
  for (let index = 0; index < rowStarts.length; index += 1) {
    const start = rowStarts[index];
    const end = index + 1 < rowStarts.length ? rowStarts[index + 1] : tableRowsRaw.length;
    const segment = tableRowsRaw.slice(start, end).trim();
    if (!segment) {
      continue;
    }
    const row = parseRow(segment);
    if (row.length !== headerCols.length) {
      break;
    }
    rowLines.push(`| ${row.join(' | ')} |`);
  }
  if (!rowLines.length) {
    return body;
  }

  const prefixWithoutHeader = prefix.slice(0, prefix.length - headerLineCandidate.length).trimEnd();
  const headerLine = `| ${headerCols.join(' | ')} |`;
  const separatorLine = `| ${separatorCols.join(' | ')} |`;
  const tableBlock = [headerLine, separatorLine, ...rowLines].join('\n');
  const joiner = prefixWithoutHeader ? '\n' : '';
  const remainderJoiner = remainder ? '\n' : '';
  return `${prefixWithoutHeader}${joiner}${tableBlock}${remainderJoiner}${remainder}`.trim();
}

function renderAssistantMarkdown(
  content: string,
  searchQueries: SearchQueryLink[] | undefined,
  onOpenCitation: (source: CitationSource) => void,
  onOpenQuery: (query: SearchQueryLink) => void,
  options?: {
    showSources?: boolean;
  }
): ReactNode {
  const showSources = options?.showSources ?? true;
  const parsed = parseAssistantContentWithSources(content);
  const normalizedBody = normalizeInlineMarkdownTable(parsed.body);
  const lines = normalizedBody.split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }
    const text = paragraphLines.join(' ').trim();
    paragraphLines = [];
    if (!text) {
      return;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="chat-gui-markdown-p">
        {renderInlineMarkdown(text, parsed.sources, onOpenCitation)}
      </p>
    );
  };

  const flushBullets = () => {
    if (!bulletItems.length) {
      return;
    }
    const items = bulletItems;
    bulletItems = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="chat-gui-markdown-ul">
        {items.map((item, index) => (
          <li key={`li-${index}`} className="chat-gui-markdown-li">
            {renderInlineMarkdown(item, parsed.sources, onOpenCitation)}
          </li>
        ))}
      </ul>
    );
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const tableParse = parseMarkdownTable(lines, lineIndex);
    if (tableParse) {
      flushParagraph();
      flushBullets();
      const { table } = tableParse;
      blocks.push(
        <div key={`table-${blocks.length}`} className="chat-gui-markdown-table-wrap">
          <table className="chat-gui-markdown-table">
            <thead>
              <tr>
                {table.header.map((cell, index) => (
                  <th key={`th-${index}`} className="chat-gui-markdown-th">
                    {renderInlineMarkdown(cell, parsed.sources, onOpenCitation)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`td-${rowIndex}-${cellIndex}`} className="chat-gui-markdown-td">
                      {renderInlineMarkdown(cell, parsed.sources, onOpenCitation)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      lineIndex += tableParse.consumed - 1;
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushBullets();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const className = level === 1 ? 'chat-gui-markdown-h1' : level === 2 ? 'chat-gui-markdown-h2' : 'chat-gui-markdown-h3';
      blocks.push(
        <h3 key={`h-${blocks.length}`} className={className}>
          {renderInlineMarkdown(text, parsed.sources, onOpenCitation)}
        </h3>
      );
      continue;
    }

    const bulletMatch = /^\s*[*-]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      bulletItems.push(bulletMatch[1].trim());
      continue;
    }

    flushBullets();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushBullets();

  if (!blocks.length) {
    return parsed.body;
  }

  const sourceList = Object.values(parsed.sources).sort((a, b) => Number(a.index) - Number(b.index));

  return (
    <div className="chat-gui-markdown">
      {blocks}
      {showSources && sourceList.length > 0 ? (
        <div className="chat-gui-sources">
          <span className="chat-gui-sources-label">Sources</span>
          <div className="chat-gui-sources-list">
            {sourceList.map((source) => (
              <button key={source.index} type="button" className="chat-gui-source-link" onClick={() => onOpenCitation(source)}>
                [{source.index}] {source.title}
                {source.domain && source.domain.trim().toLowerCase() !== source.title.trim().toLowerCase()
                  ? ` (${source.domain})`
                  : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showSources && searchQueries && searchQueries.length > 0 ? (
        <div className="chat-gui-sources">
          <span className="chat-gui-sources-label">Search Queries</span>
          <div className="chat-gui-sources-list">
            {searchQueries.map((query) => (
              <button key={query.query} type="button" className="chat-gui-source-link" onClick={() => onOpenQuery(query)}>
                {query.query}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChatGuiSurface() {
  const { agents, updateAgent, deleteAgent } = useAgentManifestStore();
  const { businessUnits, orgUnits, operators, execute: executeOrgCommand, refreshFromRuntime } = useOrgChartStore();
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [threadFilterBusinessUnitId, setThreadFilterBusinessUnitId] = useState<string>('all');
  const [threadFilterOrgUnitId, setThreadFilterOrgUnitId] = useState<string>('all');
  const [threadFilterAgentId, setThreadFilterAgentId] = useState<string>('all');
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentManifest | undefined>(undefined);
  const [activeAgentId, setActiveAgentId] = useState<string>(() => localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY) ?? '');
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncedOrgMutationRunsRef = useRef<Set<string>>(new Set());
  const activeManifest = useMemo(() => {
    if (activeAgentId) {
      const match = agents.find((agent) => agent.agentId === activeAgentId);
      if (match) {
        return match;
      }
    }
    return agents[0];
  }, [agents, activeAgentId]);
  const operatorByAgentId = useMemo(
    () => new Map(operators.filter((operator) => operator.sourceAgentId).map((operator) => [operator.sourceAgentId as string, operator])),
    [operators]
  );
  const orgUnitById = useMemo(() => new Map(orgUnits.map((unit) => [unit.id, unit])), [orgUnits]);
  const businessUnitById = useMemo(() => new Map(businessUnits.map((unit) => [unit.id, unit])), [businessUnits]);
  const activeOperator = useMemo(
    () => (activeManifest ? operatorByAgentId.get(activeManifest.agentId) : undefined),
    [activeManifest, operatorByAgentId]
  );
  const activeBusinessUnitName = useMemo(() => {
    if (!activeOperator) {
      return '';
    }
    const orgUnit = orgUnitById.get(activeOperator.orgUnitId);
    if (!orgUnit?.businessUnitId) {
      return '';
    }
    return businessUnitById.get(orgUnit.businessUnitId)?.name ?? '';
  }, [activeOperator, businessUnitById, orgUnitById]);
  const activeAgent = useMemo(
    () => ({
      id: activeManifest?.agentId ?? 'agent-default',
      name: activeManifest?.name || 'Coordinator',
      role: activeManifest?.role || 'General Assistant',
      businessUnitName: activeBusinessUnitName || undefined,
      primaryObjective: activeOperator?.primaryObjective || '',
      systemDirectiveShort:
        activeManifest?.systemDirectiveShort || 'Be concise, clear, and helpful.',
      toolsPolicyRef: activeManifest?.toolsPolicyRef || 'policy_default',
      avatarUrl: activeManifest?.avatarDataUrl || undefined
    }),
    [activeBusinessUnitName, activeManifest, activeOperator?.primaryObjective]
  );
  const {
    messages,
    threads,
    activeThreadId,
    threadsLoading,
    draft,
    isRunning,
    activeRunId,
    debugRuns,
    selectedDebugRunId,
    setSelectedDebugRunId,
    setDraft,
    submitDraft,
    activateAgent,
    openThread,
    deleteThread
  } = useChatGuiStore();
  const submitActiveDraft = useCallback(() => submitDraft(activeAgent), [submitDraft, activeAgent]);
  const composerPlaceholder = isRunning ? 'Agent is responding...' : `Message ${activeAgent.name}`;
  const isEmpty = messages.length === 0;
  const currentThreadId = activeThreadId;
  const threadDebugRuns = useMemo(
    () =>
      currentThreadId
        ? debugRuns.filter((record) => record.threadId === currentThreadId)
        : [],
    [debugRuns, currentThreadId]
  );
  const selectedDebugRun = useMemo(() => {
    if (!threadDebugRuns.length) {
      return undefined;
    }
    if (selectedDebugRunId) {
      const match = threadDebugRuns.find((record) => record.runId === selectedDebugRunId);
      if (match) {
        return match;
      }
    }
    return threadDebugRuns[0];
  }, [threadDebugRuns, selectedDebugRunId]);
  const debugJson = useMemo(
    () =>
      JSON.stringify(
        {
          clientDebugEvents: selectedDebugRun?.clientDebugEvents || [],
          runtimeEvents: selectedDebugRun?.runtimeEvents || []
        },
        null,
        2
      ),
    [selectedDebugRun]
  );
  const openExternalUrl = useCallback(
    async (url: string) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external_url', { url });
        return;
      } catch {
        // Fall through to browser fallback when invoke is unavailable.
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    []
  );

  const handleOpenCitation = useCallback(
    (source: CitationSource) => {
      openExternalUrl(source.url);
    },
    [openExternalUrl]
  );
  const handleOpenSearchQuery = useCallback(
    (query: SearchQueryLink) => {
      openExternalUrl(query.url);
    },
    [openExternalUrl]
  );
  const formatThreadTimestamp = useCallback((value: number): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }, []);

  useEffect(() => {
    const node = historyScrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (!activeManifest) {
      localStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, activeManifest.agentId);
  }, [activeManifest]);
  useEffect(() => {
    if (!activeManifest) {
      return;
    }
    void activateAgent(activeAgent);
  }, [activeManifest, activeAgent.id]);

  useEffect(() => {
    if (!threadDebugRuns.length) {
      return;
    }
    if (!selectedDebugRunId || !threadDebugRuns.some((record) => record.runId === selectedDebugRunId)) {
      setSelectedDebugRunId(threadDebugRuns[0].runId);
    }
  }, [selectedDebugRunId, setSelectedDebugRunId, threadDebugRuns]);

  useEffect(() => {
    if (!selectedDebugRun?.runId) {
      return;
    }
    const runtimeEvents = selectedDebugRun.runtimeEvents || [];
    if (syncedOrgMutationRunsRef.current.has(selectedDebugRun.runId)) {
      return;
    }
    const hasTerminal = runtimeEvents.some(
      (event) => event.event === 'run_completed' || event.event === 'run_failed' || event.event === 'run_cancelled'
    );
    if (!hasTerminal) {
      return;
    }
    const mutatedByOrgTool = runtimeEvents.some((event) => {
      if (event.event !== 'debug_tool_result' || event.tool_name !== 'org_manage_entities_v1') {
        return false;
      }
      const output = event.output as
        | { operations?: Array<{ action?: string; status?: string }> }
        | undefined;
      const operations = Array.isArray(output?.operations) ? output.operations : [];
      return operations.some((operation) => {
        const action = (operation?.action || '').toLowerCase();
        const status = (operation?.status || '').toLowerCase();
        if (status !== 'ok') {
          return false;
        }
        return (
          action.startsWith('create_') ||
          action.startsWith('update_') ||
          action.startsWith('delete_') ||
          action.startsWith('move_') ||
          action.startsWith('assign_') ||
          action.startsWith('set_')
        );
      });
    });
    if (!mutatedByOrgTool) {
      return;
    }
    syncedOrgMutationRunsRef.current.add(selectedDebugRun.runId);
    void refreshFromRuntime();
  }, [refreshFromRuntime, selectedDebugRun]);

  const handleSelectAgent = (agentId: string) => {
    setActiveAgentId(agentId);
  };
  const handleOpenConversation = async (threadId: string, operatorId: string) => {
    let targetAgent = activeAgent;
    if (operatorId !== activeAgent.id) {
      const manifest = agents.find((agent) => agent.agentId === operatorId);
      if (manifest) {
        const targetOperator = operatorByAgentId.get(manifest.agentId);
        const targetOrgUnit = targetOperator ? orgUnitById.get(targetOperator.orgUnitId) : undefined;
        const targetBusinessUnitName =
          targetOrgUnit?.businessUnitId ? businessUnitById.get(targetOrgUnit.businessUnitId)?.name ?? '' : '';
        targetAgent = {
          id: manifest.agentId,
          name: manifest.name || 'Coordinator',
          role: manifest.role || 'General Assistant',
          businessUnitName: targetBusinessUnitName || undefined,
          primaryObjective: targetOperator?.primaryObjective || '',
          systemDirectiveShort: manifest.systemDirectiveShort || 'Be concise, clear, and helpful.',
          toolsPolicyRef: manifest.toolsPolicyRef || 'policy_default',
          avatarUrl: manifest.avatarDataUrl || undefined
        };
        setActiveAgentId(manifest.agentId);
      }
    }
    await openThread(threadId, targetAgent);
    setConversationsOpen(false);
  };
  const handleConfirmDeleteConversation = async () => {
    if (!pendingDeleteThreadId) {
      return;
    }
    await deleteThread(pendingDeleteThreadId, activeAgent);
    setPendingDeleteThreadId(null);
  };

  const handleEditAgent = (agentId: string) => {
    const match = agents.find((agent) => agent.agentId === agentId);
    if (!match) {
      return;
    }
    setAgentPickerOpen(false);
    setEditingAgent(match);
  };
  const editingOperator = useMemo(
    () => (editingAgent ? operators.find((operator) => operator.sourceAgentId === editingAgent.agentId) : undefined),
    [editingAgent, operators]
  );
  const orgUnitOptions = useMemo(
    () => orgUnits.map((unit) => ({ value: unit.id, label: unit.name })),
    [orgUnits]
  );
  const managerOptions = useMemo(
    () => [
      { value: '', label: 'No manager' },
      ...operators
        .filter((operator) => operator.id !== editingOperator?.id)
        .map((operator) => ({ value: operator.id, label: `${operator.name} (${operator.title})` }))
    ],
    [editingOperator?.id, operators]
  );
  const threadFilterBusinessUnitOptions = useMemo(
    () => [{ value: 'all', label: 'All business units' }, ...businessUnits.map((unit) => ({ value: unit.id, label: unit.name }))],
    [businessUnits]
  );
  const allowedOrgUnits = useMemo(
    () =>
      threadFilterBusinessUnitId === 'all'
        ? orgUnits
        : orgUnits.filter((unit) => (unit.businessUnitId ?? 'unassigned') === threadFilterBusinessUnitId),
    [orgUnits, threadFilterBusinessUnitId]
  );
  const threadFilterOrgUnitOptions = useMemo(
    () => [{ value: 'all', label: 'All org units' }, ...allowedOrgUnits.map((unit) => ({ value: unit.id, label: unit.name }))],
    [allowedOrgUnits]
  );
  const allowedOperators = useMemo(() => {
    return operators.filter((operator) => {
      const orgUnit = orgUnitById.get(operator.orgUnitId);
      if (threadFilterBusinessUnitId !== 'all') {
        if (!orgUnit || (orgUnit.businessUnitId ?? 'unassigned') !== threadFilterBusinessUnitId) {
          return false;
        }
      }
      if (threadFilterOrgUnitId !== 'all' && operator.orgUnitId !== threadFilterOrgUnitId) {
        return false;
      }
      return true;
    });
  }, [operators, orgUnitById, threadFilterBusinessUnitId, threadFilterOrgUnitId]);
  const threadFilterAgentOptions = useMemo(
    () => [
      { value: 'all', label: 'All operators' },
      ...agents
        .filter((agent) =>
          allowedOperators.some((operator) => operator.sourceAgentId && operator.sourceAgentId === agent.agentId)
        )
        .map((agent) => ({ value: agent.agentId, label: agent.name }))
    ],
    [agents, allowedOperators]
  );
  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (threadFilterAgentId !== 'all' && thread.operatorId !== threadFilterAgentId) {
        return false;
      }
      if (threadFilterOrgUnitId !== 'all') {
        const operator = operatorByAgentId.get(thread.operatorId);
        if (!operator || operator.orgUnitId !== threadFilterOrgUnitId) {
          return false;
        }
      }
      if (threadFilterBusinessUnitId !== 'all') {
        const operator = operatorByAgentId.get(thread.operatorId);
        const orgUnit = operator ? orgUnitById.get(operator.orgUnitId) : undefined;
        if (!orgUnit || (orgUnit.businessUnitId ?? 'unassigned') !== threadFilterBusinessUnitId) {
          return false;
        }
      }
      if (!threadSearch.trim()) {
        return true;
      }
      const query = threadSearch.trim().toLowerCase();
      return (
        (thread.title || '').toLowerCase().includes(query) ||
        (thread.summary || '').toLowerCase().includes(query)
      );
    });
  }, [threads, threadFilterAgentId, threadFilterOrgUnitId, threadFilterBusinessUnitId, threadSearch, operatorByAgentId, orgUnitById]);
  useEffect(() => {
    if (threadFilterOrgUnitId === 'all') {
      return;
    }
    if (!allowedOrgUnits.some((unit) => unit.id === threadFilterOrgUnitId)) {
      setThreadFilterOrgUnitId('all');
    }
  }, [allowedOrgUnits, threadFilterOrgUnitId]);
  useEffect(() => {
    if (threadFilterAgentId === 'all') {
      return;
    }
    if (!threadFilterAgentOptions.some((option) => option.value === threadFilterAgentId)) {
      setThreadFilterAgentId('all');
    }
  }, [threadFilterAgentId, threadFilterAgentOptions]);

  const agentPickerModal = (
    <ModalShell
      open={agentPickerOpen}
      onClose={() => setAgentPickerOpen(false)}
      size="large"
      title="Select Agent"
      footer={<TextButton label="Close" variant="ghost" onClick={() => setAgentPickerOpen(false)} />}
    >
      <AgentGrid
        agents={agents}
        activeAgentId={activeAgent.id}
        onSelectAgent={handleSelectAgent}
        onEditAgent={handleEditAgent}
      />
    </ModalShell>
  );

  const agentEditModal = (
    <AgentManifestModal
      open={Boolean(editingAgent)}
      mode="edit"
      initialAgent={editingAgent}
      orgUnitOptions={orgUnitOptions}
      managerOptions={managerOptions}
      defaultOrgUnitId={editingOperator?.orgUnitId || orgUnits[0]?.id || ''}
      defaultManagerOperatorId={editingOperator?.managerOperatorId ?? null}
      onClose={() => setEditingAgent(undefined)}
      onSubmit={(input, placement) => {
        if (!editingAgent) {
          return;
        }
        updateAgent(editingAgent.agentId, input);
        if (!placement.orgUnitId) {
          return;
        }
        if (!editingOperator) {
          executeOrgCommand({
            kind: 'create_operator',
            targetOrgUnitId: placement.orgUnitId,
            payload: {
              sourceAgentId: editingAgent.agentId,
              name: input.name.trim() || 'New Operator',
              title: input.role.trim() || 'Role',
              kind: 'agent',
              managerOperatorId: placement.managerOperatorId ?? null,
              primaryObjective: input.primaryObjective,
              systemDirective: input.systemDirectiveShort,
              roleBrief: '',
              avatarSourceDataUrl: input.avatarSourceDataUrl,
              avatarDataUrl: input.avatarDataUrl
            }
          });
          return;
        }
        if (editingOperator.orgUnitId !== placement.orgUnitId) {
          executeOrgCommand({
            kind: 'move_operator',
            operatorId: editingOperator.id,
            targetOrgUnitId: placement.orgUnitId
          });
        }
        if ((editingOperator.managerOperatorId ?? null) !== (placement.managerOperatorId ?? null)) {
          executeOrgCommand({
            kind: 'set_operator_manager',
            operatorId: editingOperator.id,
            managerOperatorId: placement.managerOperatorId ?? null
          });
        }
      }}
      onDelete={() => {
        if (!editingAgent) {
          return;
        }
        deleteAgent(editingAgent.agentId);
        setEditingAgent(undefined);
      }}
    />
  );

  const debugModal = (
    <ModalShell
      open={debugOpen}
      onClose={() => setDebugOpen(false)}
      size="large"
      title="Run Debug"
      footer={<TextButton label="Close" variant="ghost" onClick={() => setDebugOpen(false)} />}
    >
      <div className="chat-gui-debug-layout">
        <aside className="chat-gui-debug-runs">
          {threadDebugRuns.map((run) => (
            <button
              key={run.runId}
              type="button"
              className={`chat-gui-debug-run-item ${selectedDebugRun?.runId === run.runId ? 'is-active' : ''}`}
              onClick={() => setSelectedDebugRunId(run.runId)}
            >
              <span className="chat-gui-debug-run-id">{run.runId}</span>
              <span className={`chat-gui-debug-run-status status-${run.status}`}>{run.status}</span>
              <span className="chat-gui-debug-run-prompt">{run.prompt}</span>
            </button>
          ))}
          {threadDebugRuns.length === 0 ? (
            <div className="chat-gui-debug-empty">No runs yet for this conversation.</div>
          ) : null}
        </aside>
        <section className="chat-gui-debug-detail">
          <div className="chat-gui-debug-meta">
            <span>Run: {selectedDebugRun?.runId || activeRunId || 'none'}</span>
            <span>Status: {selectedDebugRun?.status || (isRunning ? 'running' : 'idle')}</span>
            <span>Runtime events: {selectedDebugRun?.runtimeEvents.length || 0}</span>
            <span>Client debug events: {selectedDebugRun?.clientDebugEvents.length || 0}</span>
          </div>
          <pre className="chat-gui-debug-output">{debugJson || '[]'}</pre>
        </section>
      </div>
    </ModalShell>
  );
  const conversationsModal = (
    <ModalShell
      open={conversationsOpen}
      onClose={() => setConversationsOpen(false)}
      size="large"
      ariaLabel="Conversations"
    >
      <ModalTopRail
        left={
          <div className="chat-gui-conversations-top-left">
            <TextField
              value={threadSearch}
              onValueChange={setThreadSearch}
              placeholder="Search conversations"
              ariaLabel="Search conversations"
              size="compact"
            />
            <DropdownSelector
              value={threadFilterBusinessUnitId}
              options={threadFilterBusinessUnitOptions}
              onValueChange={setThreadFilterBusinessUnitId}
              ariaLabel="Filter by business unit"
              size="compact"
            />
            <DropdownSelector
              value={threadFilterOrgUnitId}
              options={threadFilterOrgUnitOptions}
              onValueChange={setThreadFilterOrgUnitId}
              ariaLabel="Filter by org unit"
              size="compact"
            />
            <DropdownSelector
              value={threadFilterAgentId}
              options={threadFilterAgentOptions}
              onValueChange={setThreadFilterAgentId}
              ariaLabel="Filter by operator"
              size="compact"
            />
          </div>
        }
      />
      <div className="chat-gui-conversations-grid">
        {threadsLoading ? <div className="chat-gui-conversations-empty">Loading conversations...</div> : null}
        {!threadsLoading && filteredThreads.length === 0 ? (
          <div className="chat-gui-conversations-empty">No conversations found for this filter.</div>
        ) : null}
        {!threadsLoading
          ? filteredThreads.map((thread) => {
              const threadAgent = agents.find((agent) => agent.agentId === thread.operatorId);
              const displayName = threadAgent?.name || 'Unknown operator';
              const displayRole = threadAgent?.role || 'Operator';
              const displayAvatar = threadAgent?.avatarDataUrl || undefined;
              return (
                <article
                  key={thread.threadId}
                  className={`chat-gui-conversation-card${activeThreadId === thread.threadId ? ' is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="chat-gui-conversation-delete-button"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                    onClick={() => setPendingDeleteThreadId(thread.threadId)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5 6h10M8 6V4h4v2m-6 0 1 10h6l1-10M9 9v5M11 9v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="chat-gui-conversation-open"
                    onClick={() => void handleOpenConversation(thread.threadId, thread.operatorId)}
                  >
                    <span className="chat-gui-conversation-agent">
                      <AgentAvatar name={displayName} src={displayAvatar} size="sm" shape="circle" />
                      <span className="chat-gui-conversation-agent-meta">
                        <span className="chat-gui-conversation-agent-name">{displayName}</span>
                        <span className="chat-gui-conversation-agent-role">{displayRole}</span>
                      </span>
                    </span>
                    <span className="chat-gui-conversation-summary">{thread.summary || 'No summary yet.'}</span>
                    <span className="chat-gui-conversation-meta">
                      <span className="chat-gui-conversation-date">{formatThreadTimestamp(thread.updatedAtMs)}</span>
                      <span className="chat-gui-conversation-count">{thread.messageCount} messages</span>
                    </span>
                  </button>
                </article>
              );
            })
          : null}
      </div>
      <ConfirmDialogModal
        open={Boolean(pendingDeleteThreadId)}
        title="Delete Conversation"
        message="Delete this conversation thread? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteThreadId(null)}
        onConfirm={() => void handleConfirmDeleteConversation()}
      />
    </ModalShell>
  );

  if (isEmpty) {
    return (
      <div className="chat-gui-surface">
        <header className="chat-gui-header">
          <div className="chat-gui-header-actions">
            <TextButton label="Debug" variant="ghost" onClick={() => setDebugOpen(true)} />
            <TextButton label="Conversations" variant="ghost" onClick={() => setConversationsOpen(true)} />
            <TextButton label="Agents" variant="secondary" onClick={() => setAgentPickerOpen(true)} />
          </div>
        </header>

        <div className="chat-gui-empty-body">
          <CenteredEmptyState
            lead={<AgentAvatar name={activeAgent.name} src={activeAgent.avatarUrl} size="xl" shape="circle" />}
            prompt={`How can ${activeAgent.name} help you today?`}
            action={
              <ChatComposerShell
                value={draft}
                onValueChange={setDraft}
                onSubmit={submitActiveDraft}
                placeholder={composerPlaceholder}
              />
            }
          />
        </div>

        {agentPickerModal}
        {agentEditModal}
        {conversationsModal}

        {debugModal}
      </div>
    );
  }

  return (
    <div className="chat-gui-surface">
      <header className="chat-gui-header">
        <div className="chat-gui-header-actions">
          <TextButton label="Debug" variant="ghost" onClick={() => setDebugOpen(true)} />
          <TextButton label="Conversations" variant="ghost" onClick={() => setConversationsOpen(true)} />
          <TextButton label="Agents" variant="secondary" onClick={() => setAgentPickerOpen(true)} />
        </div>
      </header>

      <div className="chat-gui-history-layout">
        <div className="chat-gui-history-scroll" ref={historyScrollRef}>
          <MessageThreadShell>
            {messages.map((message) => (
              <article key={message.id} className={`chat-gui-message role-${message.role} ${message.isPending ? 'is-pending' : ''}`}>
                {message.role === 'assistant' ? (
                  <header className="chat-gui-assistant-header">
                    <AgentAvatar
                      name={message.agentName || activeAgent.name}
                      src={message.avatarUrl || activeAgent.avatarUrl}
                      size="md"
                      shape="circle"
                    />
                    <div className="chat-gui-assistant-meta">
                      <span className="chat-gui-assistant-name">{message.agentName || activeAgent.name}</span>
                      {message.agentRole || activeAgent.role ? (
                        <span className="chat-gui-assistant-role">{message.agentRole || activeAgent.role}</span>
                      ) : null}
                    </div>
                  </header>
                ) : null}
                <div className="chat-gui-message-content">
                  {message.isPending ? (
                    <div className="chat-gui-pending-block">
                      {message.pendingStatus ? (
                        <span className="chat-gui-pending-text" data-text={message.pendingStatus}>
                          {message.pendingStatus}
                        </span>
                      ) : null}
                      {message.content ? (
                        <div className="chat-gui-pending-draft">
                          {renderAssistantMarkdown(
                            message.content,
                            undefined,
                            handleOpenCitation,
                            handleOpenSearchQuery,
                            { showSources: false }
                          )}
                        </div>
                      ) : null}
                      {message.pendingReasoning ? (
                        <div className="chat-gui-pending-reasoning">{message.pendingReasoning}</div>
                      ) : null}
                    </div>
                  ) : (
                    message.role === 'assistant'
                      ? renderAssistantMarkdown(message.content, message.searchQueries, handleOpenCitation, handleOpenSearchQuery)
                      : message.content
                  )}
                </div>
              </article>
            ))}
          </MessageThreadShell>
        </div>
        <div className="chat-gui-composer-dock">
          <ChatComposerShell
            value={draft}
            onValueChange={setDraft}
            onSubmit={submitActiveDraft}
            placeholder={composerPlaceholder}
          />
        </div>
      </div>

      {agentPickerModal}
      {agentEditModal}
      {conversationsModal}

      {debugModal}
    </div>
  );
}
