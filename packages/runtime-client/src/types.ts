import type { AgentSummary, RuntimeCapabilities } from '@agent-deck/schemas';

export interface StartRunInput {
  workspaceId: string;
  runId: string;
  threadId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentBusinessUnitName?: string;
  agentOrgUnitName?: string;
  agentPrimaryObjective?: string;
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

export type ThreadStatus = 'active' | 'archived';

export interface ChatThreadSummary {
  threadId: string;
  operatorId: string;
  title: string;
  summary: string;
  messageCount: number;
  status: ThreadStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ChatThreadMessageRecord {
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAtMs: number;
}

export interface ListThreadsInput {
  operatorId?: string;
  status?: ThreadStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateThreadInput {
  operatorId: string;
  title?: string;
}

export interface UpdateThreadInput {
  title?: string;
  summary?: string;
  status?: ThreadStatus;
}

export interface AppendThreadMessageInput {
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
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
  listThreads(input?: ListThreadsInput): Promise<ChatThreadSummary[]>;
  createThread(input: CreateThreadInput): Promise<ChatThreadSummary>;
  updateThread(threadId: string, input: UpdateThreadInput): Promise<ChatThreadSummary>;
  deleteThread(threadId: string): Promise<void>;
  listThreadMessages(threadId: string, limit?: number, offset?: number): Promise<ChatThreadMessageRecord[]>;
  appendThreadMessage(input: AppendThreadMessageInput): Promise<ChatThreadMessageRecord>;
  startRun(input: StartRunInput): Promise<StartRunResponse>;
  listRunEvents(runId: string): Promise<RuntimeRunEvent[]>;
}
