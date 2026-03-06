/**
 * Purpose: Provide the chat-gui assistant response generation seam.
 * Responsibilities:
 * - Build assistant replies from user prompts through one domain function.
 * - Serve as the swap point for provider-backed inference integration.
 */
// @tags: domain,chat-gui,response,provider-seam
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

import type { ChatMessage } from './chat-types';

export function buildAssistantResponse(userPrompt: string): ChatMessage {
  const normalizedPrompt = userPrompt.trim();
  const now = Date.now();

  const content = [
    `Received. I am treating "${normalizedPrompt}" as the active objective and will structure execution in phases so progress is traceable and reversible.`,
    '',
    'Plan scaffold:',
    '1) Clarify success criteria and constraints so the run boundary is explicit.',
    '2) Propose an execution sequence with tool calls and approval checkpoints.',
    '3) Produce artifacts and a compact run summary for replay and audit.',
    '',
    'Next, I can return a detailed task breakdown, draft the first execution run, or start by validating assumptions before any external action.'
  ].join('\n');

  return {
    id: `assistant-${now}`,
    role: 'assistant',
    content,
    createdAt: now
  };
}
