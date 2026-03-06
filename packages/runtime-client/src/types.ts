import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';

export interface AgentRuntimeClient {
  getCapabilities(): Promise<RuntimeCapabilities>;
  listAgents(): Promise<AgentSummary[]>;
}
