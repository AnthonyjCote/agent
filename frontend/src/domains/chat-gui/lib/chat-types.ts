/**
 * Purpose: Define chat-gui domain model types for chat surface state.
 * Responsibilities:
 * - Type message entries and active agent metadata.
 * - Preserve role metadata used by surface-specific rendering.
 */
// @tags: domain,chat-gui,types
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type ActiveAgent = {
  id: string;
  name: string;
  avatarUrl?: string;
};
