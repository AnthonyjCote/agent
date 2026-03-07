import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';

export interface StartRunInput {
  workspaceId: string;
  runId: string;
  threadId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  systemDirectiveShort: string;
  sender: string;
  recipient: string;
  message: string;
  allowedToolIds?: string[];
}

export interface StartRunResponse {
  runId: string;
}

export interface RuntimeRunEvent {
  event: string;
  [key: string]: unknown;
}

export interface AgentRuntimeClient {
  getCapabilities(): Promise<RuntimeCapabilities>;
  listAgents(): Promise<AgentSummary[]>;
  startRun(input: StartRunInput): Promise<StartRunResponse>;
  listRunEvents(runId: string): Promise<RuntimeRunEvent[]>;
}
