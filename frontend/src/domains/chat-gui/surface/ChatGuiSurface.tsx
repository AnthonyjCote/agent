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

import { useEffect, useRef } from 'react';
import { AgentAvatar, CenteredEmptyState, ChatComposerShell, MessageThreadShell } from '../../../shared/ui';
import { useChatGuiState } from '../model/useChatGuiState';
import './ChatGuiSurface.css';

export function ChatGuiSurface() {
  const { activeAgent, messages, draft, setDraft, submitDraft } = useChatGuiState();
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    const node = historyScrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  if (isEmpty) {
    return (
      <div className="chat-gui-surface empty">
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
    );
  }

  return (
    <div className="chat-gui-surface history">
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
  );
}
