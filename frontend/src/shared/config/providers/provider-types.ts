/**
 * Purpose: Define provider configuration contracts for shared runtime settings.
 * Responsibilities:
 * - Type provider ids and shared provider config records.
 * - Keep provider config contracts domain-neutral and reusable.
 */
// @tags: shared-config,providers,types
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

export type ProviderId = 'gemini' | 'openai' | 'local';

export type ProviderConfig = {
  enabled: boolean;
  authMode: 'cli' | 'api';
  cliCommand: string;
  model: string;
  apiKey: string;
  endpoint: string;
};

export type ProviderConfigRecord = Record<ProviderId, ProviderConfig>;
