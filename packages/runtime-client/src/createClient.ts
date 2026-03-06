import type { AgentRuntimeClient } from './types';
import { HttpTransport } from './transports/http';
import { TauriTransport } from './transports/tauri';

export type RuntimeTarget = 'desktop' | 'server';

export interface CreateClientOptions {
  target: RuntimeTarget;
  serverBaseUrl?: string;
}

export function createAgentRuntimeClient(options: CreateClientOptions): AgentRuntimeClient {
  if (options.target === 'desktop') {
    return new TauriTransport();
  }

  return new HttpTransport(options.serverBaseUrl ?? 'http://127.0.0.1:8787');
}
