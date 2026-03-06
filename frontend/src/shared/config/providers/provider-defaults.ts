/**
 * Purpose: Provide default provider configuration values.
 * Responsibilities:
 * - Supply deterministic baseline values for provider setup.
 * - Keep defaults centralized for shared config initialization.
 */
// @tags: shared-config,providers,defaults
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ProviderConfigRecord } from './provider-types';

export const DEFAULT_PROVIDER_CONFIG: ProviderConfigRecord = {
  gemini: {
    enabled: true,
    authMode: 'cli',
    cliCommand: 'gemini',
    model: 'gemini-2.5-pro',
    apiKey: '',
    endpoint: ''
  },
  openai: {
    enabled: false,
    authMode: 'api',
    cliCommand: '',
    model: 'gpt-4.1',
    apiKey: '',
    endpoint: ''
  },
  local: {
    enabled: false,
    authMode: 'api',
    cliCommand: '',
    model: 'local-model',
    apiKey: '',
    endpoint: 'http://127.0.0.1:11434'
  }
};
