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

export interface LocalStorageMigrationStatus {
  completed: boolean;
}

export interface OrgChartStatePayload {
  snapshot: unknown;
  activityEvents: unknown;
  commandHistory: unknown;
  historyCursor: number;
}

export interface AgentRuntimeClient {
  getCapabilities(): Promise<RuntimeCapabilities>;
  listAgents(): Promise<AgentSummary[]>;
  getLocalStorageMigrationStatus(): Promise<LocalStorageMigrationStatus>;
  completeLocalStorageMigration(): Promise<LocalStorageMigrationStatus>;
  listAgentManifests(): Promise<unknown[]>;
  replaceAgentManifests(manifests: unknown[]): Promise<void>;
  getOrgChartState(): Promise<OrgChartStatePayload | null>;
  saveOrgChartState(payload: OrgChartStatePayload): Promise<void>;
  startRun(input: StartRunInput): Promise<StartRunResponse>;
  listRunEvents(runId: string): Promise<RuntimeRunEvent[]>;
}
