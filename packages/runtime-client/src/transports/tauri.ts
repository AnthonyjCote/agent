import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type {
  AgentRuntimeClient,
  LocalStorageMigrationStatus,
  OrgChartStatePayload,
  RuntimeRunEvent,
  StartRunInput,
  StartRunResponse
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

  async listAgentManifests(): Promise<unknown[]> {
    const invoke = await this.getInvoke();
    return invoke<unknown[]>('list_agent_manifests');
  }

  async replaceAgentManifests(manifests: unknown[]): Promise<void> {
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

  async startRun(input: StartRunInput): Promise<StartRunResponse> {
    const invoke = await this.getInvoke();
    return invoke<StartRunResponse>('start_run', { payload: input });
  }

  async listRunEvents(runId: string): Promise<RuntimeRunEvent[]> {
    const invoke = await this.getInvoke();
    return invoke<RuntimeRunEvent[]>('list_run_events', { runId });
  }

  private async getInvoke(): Promise<TauriInvoke> {
    if (!this.invokePromise) {
      this.invokePromise = import('@tauri-apps/api/core').then((module) => module.invoke);
    }
    return this.invokePromise;
  }
}
