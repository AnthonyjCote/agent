import type { AgentManifestRecord, AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type {
  AppendThreadMessageInput,
  AppendCommsMessageInput,
  AgentRuntimeClient,
  CommsAccountRecord,
  CommsOperatorPurgeResult,
  CommsMessageRecord,
  CommsThreadRecord,
  CreateCommsThreadInput,
  DebugToolExecuteInput,
  DebugToolExecuteResult,
  DispatchWorkUnitInput,
  DispatchWorkUnitResult,
  ChatThreadMessageRecord,
  ChatThreadSummary,
  CreateThreadInput,
  ListCommsAccountsInput,
  ListCommsThreadsInput,
  ListThreadsInput,
  LocalStorageMigrationStatus,
  OrgChartStatePayload,
  RuntimeRunEvent,
  StartRunInput,
  StartRunResponse,
  UpdateCommsThreadInput,
  UpsertCommsAccountInput,
  UpdateThreadInput,
  WorkUnitRecord
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

  async listAgentManifests(): Promise<AgentManifestRecord[]> {
    const response = await fetch(`${this.baseUrl}/state/agent-manifests`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent manifests: ${response.status}`);
    }
    return (await response.json()) as AgentManifestRecord[];
  }

  async replaceAgentManifests(manifests: AgentManifestRecord[]): Promise<void> {
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

  async listThreads(input: ListThreadsInput = {}): Promise<ChatThreadSummary[]> {
    const params = new URLSearchParams();
    if (input.operatorId) params.set('operatorId', input.operatorId);
    if (input.status) params.set('status', input.status);
    if (input.search) params.set('search', input.search);
    if (typeof input.limit === 'number') params.set('limit', String(input.limit));
    if (typeof input.offset === 'number') params.set('offset', String(input.offset));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/threads${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch threads: ${response.status}`);
    }
    return (await response.json()) as ChatThreadSummary[];
  }

  async createThread(input: CreateThreadInput): Promise<ChatThreadSummary> {
    const response = await fetch(`${this.baseUrl}/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to create thread: ${response.status}`);
    }
    return (await response.json()) as ChatThreadSummary;
  }

  async updateThread(threadId: string, input: UpdateThreadInput): Promise<ChatThreadSummary> {
    const response = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to update thread: ${response.status}`);
    }
    return (await response.json()) as ChatThreadSummary;
  }

  async deleteThread(threadId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(threadId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`Failed to delete thread: ${response.status}`);
    }
  }

  async listThreadMessages(threadId: string, limit?: number, offset?: number): Promise<ChatThreadMessageRecord[]> {
    const params = new URLSearchParams();
    if (typeof limit === 'number') params.set('limit', String(limit));
    if (typeof offset === 'number') params.set('offset', String(offset));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(threadId)}/messages${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to list thread messages: ${response.status}`);
    }
    return (await response.json()) as ChatThreadMessageRecord[];
  }

  async appendThreadMessage(input: AppendThreadMessageInput): Promise<ChatThreadMessageRecord> {
    const response = await fetch(`${this.baseUrl}/threads/${encodeURIComponent(input.threadId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: input.role, content: input.content })
    });
    if (!response.ok) {
      throw new Error(`Failed to append thread message: ${response.status}`);
    }
    return (await response.json()) as ChatThreadMessageRecord;
  }

  async listCommsAccounts(input: ListCommsAccountsInput = {}): Promise<CommsAccountRecord[]> {
    const params = new URLSearchParams();
    if (input.operatorId) params.set('operatorId', input.operatorId);
    if (input.channel) params.set('channel', input.channel);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/comms/accounts${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to list comms accounts: ${response.status}`);
    }
    return (await response.json()) as CommsAccountRecord[];
  }

  async upsertCommsAccount(input: UpsertCommsAccountInput): Promise<CommsAccountRecord> {
    const response = await fetch(`${this.baseUrl}/comms/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to upsert comms account: ${response.status}`);
    }
    return (await response.json()) as CommsAccountRecord;
  }

  async listCommsThreads(input: ListCommsThreadsInput = {}): Promise<CommsThreadRecord[]> {
    const params = new URLSearchParams();
    if (input.channel) params.set('channel', input.channel);
    if (input.accountId) params.set('accountId', input.accountId);
    if (input.folder) params.set('folder', input.folder);
    if (input.search) params.set('search', input.search);
    if (typeof input.limit === 'number') params.set('limit', String(input.limit));
    if (typeof input.offset === 'number') params.set('offset', String(input.offset));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/comms/threads${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to list comms threads: ${response.status}`);
    }
    return (await response.json()) as CommsThreadRecord[];
  }

  async createCommsThread(input: CreateCommsThreadInput): Promise<CommsThreadRecord> {
    const response = await fetch(`${this.baseUrl}/comms/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to create comms thread: ${response.status}`);
    }
    return (await response.json()) as CommsThreadRecord;
  }

  async updateCommsThread(threadId: string, input: UpdateCommsThreadInput): Promise<CommsThreadRecord> {
    const response = await fetch(`${this.baseUrl}/comms/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to update comms thread: ${response.status}`);
    }
    return (await response.json()) as CommsThreadRecord;
  }

  async deleteCommsThread(threadId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/comms/threads/${encodeURIComponent(threadId)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`Failed to delete comms thread: ${response.status}`);
    }
  }

  async listCommsMessages(threadId: string, limit?: number, offset?: number): Promise<CommsMessageRecord[]> {
    const params = new URLSearchParams();
    if (typeof limit === 'number') params.set('limit', String(limit));
    if (typeof offset === 'number') params.set('offset', String(offset));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/comms/threads/${encodeURIComponent(threadId)}/messages${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to list comms messages: ${response.status}`);
    }
    return (await response.json()) as CommsMessageRecord[];
  }

  async appendCommsMessage(input: AppendCommsMessageInput): Promise<CommsMessageRecord> {
    const response = await fetch(`${this.baseUrl}/comms/threads/${encodeURIComponent(input.threadId)}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to append comms message: ${response.status}`);
    }
    return (await response.json()) as CommsMessageRecord;
  }

  async purgeOperatorCommsData(operatorId: string): Promise<CommsOperatorPurgeResult> {
    const response = await fetch(
      `${this.baseUrl}/comms/operators/${encodeURIComponent(operatorId)}/data`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error(`Failed to purge operator comms data: ${response.status}`);
    }
    return (await response.json()) as CommsOperatorPurgeResult;
  }

  async dispatchWorkUnit(input: DispatchWorkUnitInput): Promise<DispatchWorkUnitResult> {
    const response = await fetch(`${this.baseUrl}/work-units/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to dispatch work unit: ${response.status}`);
    }
    return (await response.json()) as DispatchWorkUnitResult;
  }

  async listWorkUnits(status?: string, limit?: number, offset?: number): Promise<WorkUnitRecord[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (typeof limit === 'number') params.set('limit', String(limit));
    if (typeof offset === 'number') params.set('offset', String(offset));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${this.baseUrl}/work-units${suffix}`);
    if (!response.ok) {
      throw new Error(`Failed to list work units: ${response.status}`);
    }
    return (await response.json()) as WorkUnitRecord[];
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

  async cancelRun(runId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`Failed to cancel run: ${response.status}`);
    }
    const payload = (await response.json()) as { cancelled?: boolean };
    return Boolean(payload.cancelled);
  }

  async executeDebugTool(input: DebugToolExecuteInput): Promise<DebugToolExecuteResult> {
    const response = await fetch(`${this.baseUrl}/debug/tools/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`Failed to execute debug tool: ${response.status}`);
    }
    return (await response.json()) as DebugToolExecuteResult;
  }

  async listRunEvents(runId: string): Promise<RuntimeRunEvent[]> {
    const response = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/events`);
    if (!response.ok) {
      throw new Error(`Failed to fetch run events: ${response.status}`);
    }

    return (await response.json()) as RuntimeRunEvent[];
  }

  async listThreadRunIds(threadId: string, limit?: number): Promise<string[]> {
    const params = new URLSearchParams();
    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(
      `${this.baseUrl}/threads/${encodeURIComponent(threadId)}/run-ids${suffix}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch thread run ids: ${response.status}`);
    }
    return (await response.json()) as string[];
  }
}
