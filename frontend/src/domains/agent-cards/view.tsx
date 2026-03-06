/**
 * Purpose: Define the agent-cards top-level view surface entrypoint.
 * Responsibilities:
 * - Mount the agent-cards route surface composition.
 */
// @tags: domain,agent-cards,view
// @status: active
// @owner: founder
// @domain: agent-cards
// @adr: none

import { AgentCardsSurface } from './surface';

export function AgentCardsView() {
  return <AgentCardsSurface />;
}
