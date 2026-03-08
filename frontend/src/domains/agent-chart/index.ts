/**
 * Purpose: Expose the agent-chart domain public contract to shell registry.
 * Responsibilities:
 * - Export agent-chart view definition for top-level navigation.
 */
// @tags: domain,agent-chart,exports
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import type { ViewDefinition } from '../../app/shell/model/ui-contract';
import { AgentChartView } from './view';

export const agentChartViewDefinition: ViewDefinition = {
  id: 'agent-chart',
  label: 'Org Chart',
  component: AgentChartView
};
