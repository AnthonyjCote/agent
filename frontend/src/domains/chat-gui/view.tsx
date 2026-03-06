/**
 * Purpose: Define the chat-gui top-level view surface entrypoint.
 * Responsibilities:
 * - Mount the chat-gui route surface composition.
 */
// @tags: domain,chat-gui,view
// @status: active
// @owner: founder
// @domain: chat-gui
// @adr: none

import { ChatGuiSurface } from './surface';

export function ChatGuiView() {
  return <ChatGuiSurface />;
}
