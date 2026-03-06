export interface RuntimeCapabilities {
  supportsFileSystemAccess: boolean;
  supportsHostedWebhooks: boolean;
  supportsLocalListener: boolean;
}

export interface AgentSummary {
  id: string;
  name: string;
}
