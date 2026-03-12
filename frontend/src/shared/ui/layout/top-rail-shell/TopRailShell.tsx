/**
 * Purpose: Provide a reusable full-bleed top rail for working-area panes.
 * Responsibilities:
 * - Render consistent left/right action slots above domain workspace content.
 * - Keep top controls aligned across domains using one shared shell primitive.
 */
// @tags: shared-ui,layout,top-rail
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './TopRailShell.css';

type TopRailShellProps = {
  left?: ReactNode;
  right?: ReactNode;
  tone?: 'default' | 'raised';
};

export function TopRailShell({ left, right, tone = 'raised' }: TopRailShellProps) {
  return (
    <header className={`top-rail-shell top-rail-shell-${tone}`} aria-label="Top rail controls">
      <div className="top-rail-shell-left">{left}</div>
      <div className="top-rail-shell-right">{right}</div>
    </header>
  );
}
