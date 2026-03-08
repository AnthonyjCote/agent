import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type {
  AgentRuntimeClient,
  LocalStorageMigrationStatus,
  OrgChartStatePayload,
  RuntimeRunEvent,
  StartRunInput,
  StartRunResponse
} from '../types';

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

  async getLocalStorageMigrationStatus(): Promise<LocalStorageMigrationStatus> {
    const response = await fetch(`${this.baseUrl}/persistence/migration/localstorage`);
    if (!response.ok) {
      throw new Error(`Failed to fetch migration status: ${response.status}`);
    }
    return (await response.json()) as LocalStorageMigrationStatus;
  }

  async completeLocalStorageMigration(): Promise<LocalStorageMigrationStatus> {
    const response = await fetch(`${this.baseUrl}/persistence/migration/localstorage`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`Failed to complete migration status: ${response.status}`);
    }
    return (await response.json()) as LocalStorageMigrationStatus;
  }

  async listAgentManifests(): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/state/agent-manifests`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent manifests: ${response.status}`);
    }
    return (await response.json()) as unknown[];
  }

  async replaceAgentManifests(manifests: unknown[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/state/agent-manifests`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifests)
    });
    if (!response.ok) {
      throw new Error(`Failed to persist agent manifests: ${response.status}`);
    }
  }

  async getOrgChartState(): Promise<OrgChartStatePayload | null> {
    const response = await fetch(`${this.baseUrl}/state/org-chart`);
    if (!response.ok) {
      throw new Error(`Failed to fetch org chart state: ${response.status}`);
    }
    return (await response.json()) as OrgChartStatePayload | null;
  }

  async saveOrgChartState(payload: OrgChartStatePayload): Promise<void> {
    const response = await fetch(`${this.baseUrl}/state/org-chart`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Failed to persist org chart state: ${response.status}`);
    }
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
