/**
 * Purpose: Register top-level app views for rail ordering and shell routing.
 * Responsibilities:
 * - Map ViewMode values to domain view definitions.
 * - Provide canonical rail order for navigation controls.
 */
// @tags: app,shell,registry,routing
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import type { ViewDefinition, ViewMode } from './model/ui-contract';
import { chatGuiViewDefinition } from '../../domains/chat-gui';
import { agentCardsViewDefinition } from '../../domains/agent-cards';
import { agentChartViewDefinition } from '../../domains/agent-chart';
import { appSettingsViewDefinition } from '../../domains/app-settings';

export const VIEW_ORDER: ViewMode[] = ['chat-gui', 'agent-cards', 'agent-chart', 'app-settings'];

export const VIEW_DEFINITIONS: Record<ViewMode, ViewDefinition> = {
  'chat-gui': chatGuiViewDefinition,
  'agent-cards': agentCardsViewDefinition,
  'agent-chart': agentChartViewDefinition,
  'app-settings': appSettingsViewDefinition
};
