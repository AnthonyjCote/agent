/**
 * Purpose: Define app-settings category metadata.
 * Responsibilities:
 * - Provide category identifiers and labels for settings navigation.
 */
// @tags: domain,app-settings,categories
// @status: active
// @owner: founder
// @domain: app-settings
// @adr: none

export type SettingsCategoryId = 'providers' | 'runtime' | 'security';

export type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'security', label: 'Security' }
];
