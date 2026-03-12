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

export interface DebugToolExecuteInput {
  toolId: string;
  args: Record<string, unknown>;
  operatorId?: string;
  operatorName?: string;
}

export interface DebugToolExecuteResult {
  ok: boolean;
  toolId: string;
  normalizedArgs?: Record<string, unknown>;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
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

export type CommsChannel = 'email' | 'chat' | 'sms';

export interface CommsAccountRecord {
  accountId: string;
  operatorId: string;
  channel: string;
  address: string;
  displayName: string;
  status: string;
  provider: string;
  providerConfigRef?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CommsThreadRecord {
  threadId: string;
  channel: string;
  accountId: string;
  title: string;
  subject: string;
  threadKey: string;
  participants: unknown;
  state: string;
  folder: string;
  messageCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  lastMessageAtMs: number;
}

export interface CommsMessageRecord {
  messageId: string;
  threadId: string;
  channel: string;
  direction: string;
  fromAccountRef: string;
  toParticipants: unknown;
  ccParticipants: unknown;
  bccParticipants: unknown;
  subject: string;
  bodyText: string;
  replyToMessageId?: string;
  externalMessageRef?: string;
  createdAtMs: number;
}

export interface ListCommsAccountsInput {
  operatorId?: string;
  channel?: CommsChannel;
}

export interface UpsertCommsAccountInput {
  accountId: string;
  operatorId: string;
  channel: CommsChannel;
  address: string;
  displayName: string;
  status?: string;
}

export interface ListCommsThreadsInput {
  channel?: CommsChannel;
  accountId?: string;
  folder?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCommsThreadInput {
  channel: CommsChannel;
  accountId: string;
  title?: string;
  subject?: string;
  participants?: unknown;
  folder?: string;
}

export interface UpdateCommsThreadInput {
  title?: string;
  subject?: string;
  state?: string;
  folder?: string;
}

export interface AppendCommsMessageInput {
  threadId: string;
  direction?: string;
  fromAccountRef: string;
  toParticipants?: unknown;
  ccParticipants?: unknown;
  bccParticipants?: unknown;
  subject?: string;
  bodyText: string;
  replyToMessageId?: string;
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

export type WorkUnitDispatchMode = 'direct' | 'orchestrated';
export type WorkUnitExecutionMode = 'agent_run' | 'automation_run';

export interface WorkUnit {
  id?: string;
  domain: string;
  actionType: string;
  targetOperator: string;
  scope: {
    businessUnitNameRef: string;
    orgUnitNameRef: string;
  };
  input: Record<string, unknown>;
  toolScope: string[];
  priority: {
    urgencyScore: number;
    importanceScore: number;
    deadlineAt?: string;
  };
  execution: {
    mode: WorkUnitExecutionMode;
    maxAttempts: number;
    timeoutMs: number;
  };
  ordering?: {
    sequenceKey?: string;
    dependsOn?: string[];
  };
  idempotency: {
    dedupeKey: string;
  };
  trace: {
    correlationId: string;
    causationId: string;
    sourceEventType: string;
    sourceEventId: string;
  };
}

export interface DispatchWorkUnitInput {
  workUnit: WorkUnit;
  options?: {
    executionModeOverride?: WorkUnitDispatchMode;
    dryRun?: boolean;
    requestedBy?: string;
  };
}

export interface DispatchWorkUnitResult {
  workUnitId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'dead_lettered';
  runId?: string;
  resultRef?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  trace: {
    correlationId: string;
    causationId: string;
  };
  dispatchMode: WorkUnitDispatchMode;
}

export interface WorkUnitRecord {
  workUnitId: string;
  domain: string;
  actionType: string;
  targetOperator: string;
  status: string;
  dispatchMode: string;
  executionMode: string;
  runId?: string;
  dedupeKey: string;
  correlationId: string;
  causationId: string;
  workUnit: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
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
  listCommsAccounts(input?: ListCommsAccountsInput): Promise<CommsAccountRecord[]>;
  upsertCommsAccount(input: UpsertCommsAccountInput): Promise<CommsAccountRecord>;
  listCommsThreads(input?: ListCommsThreadsInput): Promise<CommsThreadRecord[]>;
  createCommsThread(input: CreateCommsThreadInput): Promise<CommsThreadRecord>;
  updateCommsThread(threadId: string, input: UpdateCommsThreadInput): Promise<CommsThreadRecord>;
  deleteCommsThread(threadId: string): Promise<void>;
  listCommsMessages(threadId: string, limit?: number, offset?: number): Promise<CommsMessageRecord[]>;
  appendCommsMessage(input: AppendCommsMessageInput): Promise<CommsMessageRecord>;
  dispatchWorkUnit(input: DispatchWorkUnitInput): Promise<DispatchWorkUnitResult>;
  listWorkUnits(status?: string, limit?: number, offset?: number): Promise<WorkUnitRecord[]>;
  startRun(input: StartRunInput): Promise<StartRunResponse>;
  cancelRun(runId: string): Promise<boolean>;
  executeDebugTool(input: DebugToolExecuteInput): Promise<DebugToolExecuteResult>;
  listRunEvents(runId: string): Promise<RuntimeRunEvent[]>;
  listThreadRunIds(threadId: string, limit?: number): Promise<string[]>;
}
