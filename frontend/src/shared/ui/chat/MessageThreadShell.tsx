/**
 * Purpose: Provide reusable thread container scaffolding for chat surfaces.
 * Responsibilities:
 * - Render message timeline container and spacing.
 * - Keep message shell style reusable while domain owns message logic.
 */
// @tags: shared-ui,chat,thread
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './MessageThreadShell.css';

type MessageThreadShellProps = {
  children: ReactNode;
};

export function MessageThreadShell({ children }: MessageThreadShellProps) {
  return <section className="message-thread-shell">{children}</section>;
}
