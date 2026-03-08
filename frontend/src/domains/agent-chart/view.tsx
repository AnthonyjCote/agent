/**
 * Purpose: Define the agent-chart top-level view surface entrypoint.
 * Responsibilities:
 * - Mount the agent-chart route surface composition.
 */
// @tags: domain,agent-chart,view
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

import { AgentChartSurface } from './surface';

export function AgentChartView() {
  return <AgentChartSurface />;
}
