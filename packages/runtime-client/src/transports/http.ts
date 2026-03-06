import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type { AgentRuntimeClient } from '../types';

export class HttpTransport implements AgentRuntimeClient {
  constructor(private readonly baseUrl: string) {}

  async getCapabilities(): Promise<RuntimeCapabilities> {
    const response = await fetch(`${this.baseUrl}/capabilities`);
    if (!response.ok) {
      throw new Error(`Failed to fetch capabilities: ${response.status}`);
    }
    return (await response.json()) as RuntimeCapabilities;
  }

  async listAgents(): Promise<AgentSummary[]> {
    const response = await fetch(`${this.baseUrl}/agents`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.status}`);
    }
    return (await response.json()) as AgentSummary[];
  }
}
