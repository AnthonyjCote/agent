/**
 * Purpose: Render provider configuration sections for app settings.
 * Responsibilities:
 * - Compose one column card per provider.
 * - Bind provider config fields to shared provider config store.
 */
// @tags: domain,app-settings,providers,panel
// @status: active
// @owner: founder
// @domain: app-settings
// @adr: none

import { useProviderConfigStore, type ProviderId } from '@/shared/config';
import { ColumnCard, DropdownSelector, TextField, ToggleSwitch } from '@/shared/ui';
import './ProvidersSettingsPanel.css';

const PROVIDER_IDS: ProviderId[] = ['gemini', 'openai', 'local'];

type ProviderFormSectionProps = {
  providerId: ProviderId;
  config: ReturnType<typeof useProviderConfigStore>['config'];
  updateProvider: ReturnType<typeof useProviderConfigStore>['updateProvider'];
};

function ProviderFormSection({ providerId, config, updateProvider }: ProviderFormSectionProps) {
  const provider = config[providerId];

  return (
    <ColumnCard
      title={providerId === 'gemini' ? 'Gemini' : providerId === 'openai' ? 'OpenAI' : 'Local Provider'}
      description="Authentication and model/runtime configuration"
    >
      <label className="provider-field">
        <span>Enabled</span>
        <ToggleSwitch
          checked={provider.enabled}
          ariaLabel={`${providerId} enabled`}
          onCheckedChange={(next) => updateProvider(providerId, { enabled: next })}
        />
      </label>

      <label className="provider-field">
        <span>Auth Mode</span>
        <DropdownSelector
          value={provider.authMode}
          ariaLabel={`${providerId} auth mode`}
          onValueChange={(value) => updateProvider(providerId, { authMode: value as 'cli' | 'api' })}
          options={[
            { value: 'cli', label: 'CLI' },
            { value: 'api', label: 'API' }
          ]}
        />
      </label>

      <label className="provider-field">
        <span>CLI Command</span>
        <TextField
          value={provider.cliCommand}
          ariaLabel={`${providerId} cli command`}
          onValueChange={(next) => updateProvider(providerId, { cliCommand: next })}
        />
      </label>

      <label className="provider-field">
        <span>Model</span>
        <TextField
          value={provider.model}
          ariaLabel={`${providerId} model`}
          onValueChange={(next) => updateProvider(providerId, { model: next })}
        />
      </label>

      <label className="provider-field">
        <span>API Key</span>
        <TextField
          type="password"
          value={provider.apiKey}
          ariaLabel={`${providerId} api key`}
          onValueChange={(next) => updateProvider(providerId, { apiKey: next })}
        />
      </label>

      <label className="provider-field">
        <span>Endpoint</span>
        <TextField
          value={provider.endpoint}
          ariaLabel={`${providerId} endpoint`}
          onValueChange={(next) => updateProvider(providerId, { endpoint: next })}
        />
      </label>
    </ColumnCard>
  );
}

export function ProvidersSettingsPanel() {
  const { config, updateProvider } = useProviderConfigStore();

  return (
    <div className="providers-settings-panel">
      {PROVIDER_IDS.map((providerId) => (
        <ProviderFormSection
          key={providerId}
          providerId={providerId}
          config={config}
          updateProvider={updateProvider}
        />
      ))}
    </div>
  );
}
