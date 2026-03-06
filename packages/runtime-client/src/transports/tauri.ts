import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';
import type { AgentRuntimeClient } from '../types';

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

  private async getInvoke(): Promise<TauriInvoke> {
    if (!this.invokePromise) {
      this.invokePromise = import('@tauri-apps/api/core').then((module) => module.invoke);
    }
    return this.invokePromise;
  }
}
