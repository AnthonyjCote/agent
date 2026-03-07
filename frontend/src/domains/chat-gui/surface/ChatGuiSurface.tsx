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
import { useRuntimeClient } from '../../../app/runtime/RuntimeProvider';
import { type AgentManifest, useAgentManifestStore } from '../../../shared/config/agents';
import { AgentManifestModal } from '../../../shared/modules';
import { AgentAvatar, AgentGrid, CenteredEmptyState, ChatComposerShell, MessageThreadShell, ModalShell, TextButton } from '../../../shared/ui';
import type { SearchQueryLink } from '../lib';
import { useChatGuiState } from '../model/useChatGuiState';
import './ChatGuiSurface.css';

const ACTIVE_AGENT_STORAGE_KEY = 'agent-deck:chat:active-agent-id';

type CitationSource = {
  index: string;
  title: string;
  domain?: string;
  url: string;
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

function renderAssistantMarkdown(
  content: string,
  searchQueries: SearchQueryLink[] | undefined,
  onOpenCitation: (source: CitationSource) => void,
  onOpenQuery: (query: SearchQueryLink) => void
): ReactNode {
  const parsed = parseAssistantContentWithSources(content);
  const lines = parsed.body.split('\n');
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

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushBullets();
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
      {sourceList.length > 0 ? (
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
      {searchQueries && searchQueries.length > 0 ? (
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
  const runtimeClient = useRuntimeClient();
  const { agents, updateAgent, deleteAgent } = useAgentManifestStore();
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentManifest | undefined>(undefined);
  const [activeAgentId, setActiveAgentId] = useState<string>(() => localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY) ?? '');
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const activeManifest = useMemo(() => {
    if (activeAgentId) {
      const match = agents.find((agent) => agent.agentId === activeAgentId);
      if (match) {
        return match;
      }
    }
    return agents[0];
  }, [agents, activeAgentId]);
  const activeAgent = useMemo(
    () => ({
      id: activeManifest?.agentId ?? 'agent-default',
      name: activeManifest?.name || 'Coordinator',
      role: activeManifest?.role || 'General Assistant',
      systemDirectiveShort:
        activeManifest?.systemDirectiveShort || 'Be concise, clear, and helpful.',
      toolsPolicyRef: activeManifest?.toolsPolicyRef || 'policy_default',
      avatarUrl: activeManifest?.avatarDataUrl || undefined
    }),
    [activeManifest]
  );
  const {
    messages,
    draft,
    isRunning,
    activeRunId,
    debugRuns,
    selectedDebugRunId,
    setSelectedDebugRunId,
    setDraft,
    submitDraft
  } = useChatGuiState(activeAgent, runtimeClient);
  const composerPlaceholder = isRunning ? 'Agent is responding...' : `Message ${activeAgent.name}`;
  const isEmpty = messages.length === 0;
  const currentThreadId = `thread_${activeAgent.id}`;
  const threadDebugRuns = useMemo(
    () => debugRuns.filter((record) => record.threadId === currentThreadId),
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
    if (!threadDebugRuns.length) {
      return;
    }
    if (!selectedDebugRunId || !threadDebugRuns.some((record) => record.runId === selectedDebugRunId)) {
      setSelectedDebugRunId(threadDebugRuns[0].runId);
    }
  }, [selectedDebugRunId, setSelectedDebugRunId, threadDebugRuns]);

  const handleSelectAgent = (agentId: string) => {
    setActiveAgentId(agentId);
  };

  const handleEditAgent = (agentId: string) => {
    const match = agents.find((agent) => agent.agentId === agentId);
    if (!match) {
      return;
    }
    setAgentPickerOpen(false);
    setEditingAgent(match);
  };

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

  if (isEmpty) {
    return (
      <div className="chat-gui-surface">
        <header className="chat-gui-header">
          <div className="chat-gui-header-actions">
            <TextButton label="Debug" variant="ghost" onClick={() => setDebugOpen(true)} />
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
                onSubmit={submitDraft}
                placeholder={composerPlaceholder}
              />
            }
          />
        </div>

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

        <AgentManifestModal
          open={Boolean(editingAgent)}
          mode="edit"
          initialAgent={editingAgent}
          onClose={() => setEditingAgent(undefined)}
          onSubmit={(input) => {
            if (!editingAgent) {
              return;
            }
            updateAgent(editingAgent.agentId, input);
          }}
          onDelete={() => {
            if (!editingAgent) {
              return;
            }
            deleteAgent(editingAgent.agentId);
            setEditingAgent(undefined);
          }}
        />

        {debugModal}
      </div>
    );
  }

  return (
    <div className="chat-gui-surface">
      <header className="chat-gui-header">
        <div className="chat-gui-header-actions">
          <TextButton label="Debug" variant="ghost" onClick={() => setDebugOpen(true)} />
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
                <div className={`chat-gui-message-content ${message.isPending ? 'is-shimmering' : ''}`}>
                  {message.isPending ? (
                    <div className="chat-gui-pending-block">
                      <span className="chat-gui-pending-text" data-text={message.content}>
                        {message.content}
                      </span>
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
            onSubmit={submitDraft}
            placeholder={composerPlaceholder}
          />
        </div>
      </div>

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

      <AgentManifestModal
        open={Boolean(editingAgent)}
        mode="edit"
        initialAgent={editingAgent}
        onClose={() => setEditingAgent(undefined)}
        onSubmit={(input) => {
          if (!editingAgent) {
            return;
          }
          updateAgent(editingAgent.agentId, input);
        }}
        onDelete={() => {
          if (!editingAgent) {
            return;
          }
          deleteAgent(editingAgent.agentId);
          setEditingAgent(undefined);
        }}
      />

      {debugModal}
    </div>
  );
}
