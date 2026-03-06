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

import { useState } from 'react';
import { buildAssistantResponse, type ActiveAgent, type ChatMessage } from '../lib';

export function useChatGuiState(activeAgent: ActiveAgent) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const submitDraft = () => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `user-${now}`,
      role: 'user',
      content,
      createdAt: now
    };

    const assistantMessage = buildAssistantResponse(content);

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft('');
  };

  return {
    messages,
    draft,
    setDraft,
    submitDraft
  };
}
