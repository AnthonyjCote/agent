/**
 * Purpose: Define the app-settings top-level view surface entrypoint.
 * Responsibilities:
 * - Mount the app-settings route surface composition.
 */
// @tags: domain,app-settings,view
// @status: active
// @owner: founder
// @domain: app-settings
// @adr: none

import { AppSettingsSurface } from './surface';

export function AppSettingsView() {
  return <AppSettingsSurface />;
}
