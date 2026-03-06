/**
 * Purpose: Provide a shared provider configuration state hook.
 * Responsibilities:
 * - Expose provider config state for domain settings surfaces.
 * - Persist provider updates through shared storage seam.
 */
// @tags: shared-config,providers,store
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { useEffect, useState } from 'react';
import { loadProviderConfig, saveProviderConfig } from './provider-storage';
import type { ProviderConfig, ProviderConfigRecord, ProviderId } from './provider-types';

export function useProviderConfigStore() {
  const [config, setConfig] = useState<ProviderConfigRecord>(() => loadProviderConfig());

  useEffect(() => {
    saveProviderConfig(config);
  }, [config]);

  const updateProvider = (providerId: ProviderId, patch: Partial<ProviderConfig>) => {
    setConfig((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        ...patch
      }
    }));
  };

  return {
    config,
    updateProvider
  };
}
