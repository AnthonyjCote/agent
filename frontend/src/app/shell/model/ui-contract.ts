/**
 * Purpose: Define shell view contracts for global rail navigation and active-view rendering.
 * Responsibilities:
 * - Provide shared ViewMode typing across shell modules.
 * - Define view metadata required by rail and router composition.
 */
// @tags: app,shell,contracts,types
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import type { ReactNode } from 'react';

export type ViewMode = 'chat-gui' | 'agent-cards' | 'agent-chart' | 'app-settings';

export type ViewDefinition = {
  id: ViewMode;
  label: string;
  component: () => ReactNode;
};
