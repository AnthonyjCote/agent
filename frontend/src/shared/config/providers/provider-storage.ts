/**
 * Purpose: Persist provider configuration in browser storage.
 * Responsibilities:
 * - Load provider config snapshot with fallback defaults.
 * - Save provider config changes for local development continuity.
 */
// @tags: shared-config,providers,storage
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { DEFAULT_PROVIDER_CONFIG } from './provider-defaults';
import type { ProviderConfigRecord } from './provider-types';

const STORAGE_KEY = 'agent-deck.provider-config';

export function loadProviderConfig(): ProviderConfigRecord {
  if (typeof window === 'undefined') {
    return DEFAULT_PROVIDER_CONFIG;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_PROVIDER_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProviderConfigRecord>;
    return {
      gemini: { ...DEFAULT_PROVIDER_CONFIG.gemini, ...parsed.gemini },
      openai: { ...DEFAULT_PROVIDER_CONFIG.openai, ...parsed.openai },
      local: { ...DEFAULT_PROVIDER_CONFIG.local, ...parsed.local }
    };
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
}

export function saveProviderConfig(config: ProviderConfigRecord) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
