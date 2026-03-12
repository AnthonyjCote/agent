/**
 * Purpose: Expose the app-settings domain public contract to shell registry.
 * Responsibilities:
 * - Export app-settings view definition for top-level navigation.
 */
// @tags: domain,app-settings,exports
// @status: active
// @owner: founder
// @domain: app-settings
// @adr: none

import type { ViewDefinition } from '@/app/shell/model/ui-contract';
import { AppSettingsView } from './view';

export const appSettingsViewDefinition: ViewDefinition = {
  id: 'app-settings',
  label: 'Settings',
  component: AppSettingsView
};
