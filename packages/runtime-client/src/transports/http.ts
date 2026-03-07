import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type { AgentRuntimeClient, RuntimeRunEvent, StartRunInput, StartRunResponse } from '../types';

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

  async startRun(input: StartRunInput): Promise<StartRunResponse> {
    const response = await fetch(`${this.baseUrl}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      throw new Error(`Failed to start run: ${response.status}`);
    }

    return (await response.json()) as StartRunResponse;
  }

  async listRunEvents(runId: string): Promise<RuntimeRunEvent[]> {
    const response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/events`);
    if (!response.ok) {
      throw new Error(`Failed to fetch run events: ${response.status}`);
    }

    return (await response.json()) as RuntimeRunEvent[];
  }
}
