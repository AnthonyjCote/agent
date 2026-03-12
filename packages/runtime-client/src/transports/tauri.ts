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

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class TauriTransport implements AgentRuntimeClient {
  private invokePromise: Promise<TauriInvoke> | null = null;

  async getCapabilities(): Promise<RuntimeCapabilities> {
    const invoke = await this.getInvoke();
    return invoke<RuntimeCapabilities>('get_capabilities');
  }

  async listAgents(): Promise<AgentSummary[]> {
    const invoke = await this.getInvoke();
    return invoke<AgentSummary[]>('list_agents');
  }

  async getLocalStorageMigrationStatus(): Promise<LocalStorageMigrationStatus> {
    const invoke = await this.getInvoke();
    return invoke<LocalStorageMigrationStatus>('get_localstorage_migration_status');
  }

  async completeLocalStorageMigration(): Promise<LocalStorageMigrationStatus> {
    const invoke = await this.getInvoke();
    return invoke<LocalStorageMigrationStatus>('complete_localstorage_migration');
  }

  async listAgentManifests(): Promise<AgentManifestRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<AgentManifestRecord[]>('list_agent_manifests');
  }

  async replaceAgentManifests(manifests: AgentManifestRecord[]): Promise<void> {
    const invoke = await this.getInvoke();
    await invoke<void>('replace_agent_manifests', { manifests });
  }

  async getOrgChartState(): Promise<OrgChartStatePayload | null> {
    const invoke = await this.getInvoke();
    return invoke<OrgChartStatePayload | null>('get_org_chart_state');
  }

  async saveOrgChartState(payload: OrgChartStatePayload): Promise<void> {
    const invoke = await this.getInvoke();
    await invoke<void>('save_org_chart_state', { payload });
  }

  async listThreads(input: ListThreadsInput = {}): Promise<ChatThreadSummary[]> {
    const invoke = await this.getInvoke();
    return invoke<ChatThreadSummary[]>('list_threads', { input });
  }

  async createThread(input: CreateThreadInput): Promise<ChatThreadSummary> {
    const invoke = await this.getInvoke();
    return invoke<ChatThreadSummary>('create_thread', { input });
  }

  async updateThread(threadId: string, input: UpdateThreadInput): Promise<ChatThreadSummary> {
    const invoke = await this.getInvoke();
    return invoke<ChatThreadSummary>('update_thread', { threadId, input });
  }

  async deleteThread(threadId: string): Promise<void> {
    const invoke = await this.getInvoke();
    await invoke<void>('delete_thread', { threadId });
  }

  async listThreadMessages(threadId: string, limit?: number, offset?: number): Promise<ChatThreadMessageRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<ChatThreadMessageRecord[]>('list_thread_messages', { threadId, limit, offset });
  }

  async appendThreadMessage(input: AppendThreadMessageInput): Promise<ChatThreadMessageRecord> {
    const invoke = await this.getInvoke();
    return invoke<ChatThreadMessageRecord>('append_thread_message', { input });
  }

  async listCommsAccounts(input: ListCommsAccountsInput = {}): Promise<CommsAccountRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<CommsAccountRecord[]>('list_comms_accounts', { input });
  }

  async upsertCommsAccount(input: UpsertCommsAccountInput): Promise<CommsAccountRecord> {
    const invoke = await this.getInvoke();
    return invoke<CommsAccountRecord>('upsert_comms_account', { input });
  }

  async listCommsThreads(input: ListCommsThreadsInput = {}): Promise<CommsThreadRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<CommsThreadRecord[]>('list_comms_threads', { input });
  }

  async createCommsThread(input: CreateCommsThreadInput): Promise<CommsThreadRecord> {
    const invoke = await this.getInvoke();
    return invoke<CommsThreadRecord>('create_comms_thread', { input });
  }

  async updateCommsThread(threadId: string, input: UpdateCommsThreadInput): Promise<CommsThreadRecord> {
    const invoke = await this.getInvoke();
    return invoke<CommsThreadRecord>('update_comms_thread', { threadId, input });
  }

  async deleteCommsThread(threadId: string): Promise<void> {
    const invoke = await this.getInvoke();
    await invoke<void>('delete_comms_thread', { threadId });
  }

  async listCommsMessages(threadId: string, limit?: number, offset?: number): Promise<CommsMessageRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<CommsMessageRecord[]>('list_comms_messages', { threadId, limit, offset });
  }

  async appendCommsMessage(input: AppendCommsMessageInput): Promise<CommsMessageRecord> {
    const invoke = await this.getInvoke();
    return invoke<CommsMessageRecord>('append_comms_message', { input });
  }

  async purgeOperatorCommsData(operatorId: string): Promise<CommsOperatorPurgeResult> {
    const invoke = await this.getInvoke();
    return invoke<CommsOperatorPurgeResult>('purge_operator_comms_data', { operatorId });
  }

  async dispatchWorkUnit(input: DispatchWorkUnitInput): Promise<DispatchWorkUnitResult> {
    const invoke = await this.getInvoke();
    return invoke<DispatchWorkUnitResult>('dispatch_work_unit', { input });
  }

  async listWorkUnits(status?: string, limit?: number, offset?: number): Promise<WorkUnitRecord[]> {
    const invoke = await this.getInvoke();
    return invoke<WorkUnitRecord[]>('list_work_units', { status, limit, offset });
  }

  async startRun(input: StartRunInput): Promise<StartRunResponse> {
    const invoke = await this.getInvoke();
    return invoke<StartRunResponse>('start_run', { payload: input });
  }

  async cancelRun(runId: string): Promise<boolean> {
    const invoke = await this.getInvoke();
    return invoke<boolean>('cancel_run', { runId });
  }

  async executeDebugTool(input: DebugToolExecuteInput): Promise<DebugToolExecuteResult> {
    const invoke = await this.getInvoke();
    return invoke<DebugToolExecuteResult>('execute_debug_tool', { input });
  }

  async listRunEvents(runId: string): Promise<RuntimeRunEvent[]> {
    const invoke = await this.getInvoke();
    return invoke<RuntimeRunEvent[]>('list_run_events', { runId });
  }

  async listThreadRunIds(threadId: string, limit?: number): Promise<string[]> {
    const invoke = await this.getInvoke();
    return invoke<string[]>('list_thread_run_ids', { threadId, limit });
  }

  private async getInvoke(): Promise<TauriInvoke> {
    if (!this.invokePromise) {
      this.invokePromise = import('@tauri-apps/api/core').then((module) => module.invoke);
    }
    return this.invokePromise;
  }
}
