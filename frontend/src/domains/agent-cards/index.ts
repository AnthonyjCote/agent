/**
 * Purpose: Expose the agent-cards domain public contract to shell registry.
 * Responsibilities:
 * - Export agent-cards view definition for top-level navigation.
 */
// @tags: domain,agent-cards,exports
// @status: active
// @owner: founder
// @domain: agent-cards
// @adr: none

import type { ViewDefinition } from '@/app/shell/model/ui-contract';
import { AgentCardsView } from './view';

export const agentCardsViewDefinition: ViewDefinition = {
  id: 'agent-cards',
  label: 'Agent Cards',
  component: AgentCardsView
};
