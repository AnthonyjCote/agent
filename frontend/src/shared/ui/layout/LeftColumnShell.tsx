/**
 * Purpose: Provide a generic left-column layout shell for two-pane surfaces.
 * Responsibilities:
 * - Render fixed-width left column and flexible right pane.
 * - Keep layout primitive domain-neutral for reuse across app views.
 */
// @tags: shared-ui,layout,columns
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './LeftColumnShell.css';

type LeftColumnShellProps = {
  left: ReactNode;
  right: ReactNode;
};

export function LeftColumnShell({ left, right }: LeftColumnShellProps) {
  return (
    <section className="left-column-shell">
      <aside className="left-column-shell-left">{left}</aside>
      <div className="left-column-shell-right">{right}</div>
    </section>
  );
}
