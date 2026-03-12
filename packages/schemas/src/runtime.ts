export interface RuntimeCapabilities {
  supportsFileSystemAccess: boolean;
  supportsHostedWebhooks: boolean;
  supportsLocalListener: boolean;
}

export interface AgentSummary {
  id: string;
  name: string;
}

export interface AgentManifestRecord {
  schemaVersion?: string;
  agentId?: string;
  avatarSourceDataUrl?: string;
  avatarDataUrl?: string;
  name?: string;
  role?: string;
  primaryObjective?: string;
  systemDirectiveShort?: string;
  toolsPolicyRef?: string;
  createdAt?: string;
  updatedAt?: string;
}
