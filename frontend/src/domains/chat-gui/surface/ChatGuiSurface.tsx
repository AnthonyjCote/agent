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

import { useEffect, useMemo, useRef, useState } from 'react';
import { type AgentManifest, useAgentManifestStore } from '../../../shared/config/agents';
import { AgentManifestModal } from '../../../shared/modules';
import { AgentAvatar, AgentGrid, CenteredEmptyState, ChatComposerShell, MessageThreadShell, ModalShell, TextButton } from '../../../shared/ui';
import { useChatGuiState } from '../model/useChatGuiState';
import './ChatGuiSurface.css';

const ACTIVE_AGENT_STORAGE_KEY = 'agent-deck:chat:active-agent-id';

export function ChatGuiSurface() {
  const { agents, updateAgent, deleteAgent } = useAgentManifestStore();
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
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
      avatarUrl: activeManifest?.avatarDataUrl || undefined
    }),
    [activeManifest]
  );
  const { messages, draft, setDraft, submitDraft } = useChatGuiState(activeAgent);
  const isEmpty = messages.length === 0;

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

  if (isEmpty) {
    return (
      <div className="chat-gui-surface">
        <header className="chat-gui-header">
          <TextButton label="Agents" variant="secondary" onClick={() => setAgentPickerOpen(true)} />
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
                placeholder="Message your agent..."
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
      </div>
    );
  }

  return (
    <div className="chat-gui-surface">
      <header className="chat-gui-header">
        <TextButton label="Agents" variant="secondary" onClick={() => setAgentPickerOpen(true)} />
      </header>

      <div className="chat-gui-history-layout">
        <div className="chat-gui-history-scroll" ref={historyScrollRef}>
          <MessageThreadShell>
            {messages.map((message) => (
              <article key={message.id} className={`chat-gui-message role-${message.role}`}>
                <div className="chat-gui-message-content">{message.content}</div>
              </article>
            ))}
          </MessageThreadShell>
        </div>
        <div className="chat-gui-composer-dock">
          <ChatComposerShell
            value={draft}
            onValueChange={setDraft}
            onSubmit={submitDraft}
            placeholder="Message your agent..."
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
    </div>
  );
}
