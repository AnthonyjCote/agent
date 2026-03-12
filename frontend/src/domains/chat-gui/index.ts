/**
 * Purpose: Expose the chat-gui domain public contract to shell registry.
 * Responsibilities:
 * - Export chat-gui view definition for top-level navigation.
 */
// @tags: domain,chat-gui,exports
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

import type { ViewDefinition } from '@/app/shell/model/ui-contract';
import { ChatGuiView } from './view';

export const chatGuiViewDefinition: ViewDefinition = {
  id: 'chat-gui',
  label: 'Chat GUI',
  component: ChatGuiView
};
