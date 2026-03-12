/**
 * Purpose: Provide a reusable full-bleed top bar for left-column surfaces.
 * Responsibilities:
 * - Render consistent left/right action slots inside column shells.
 * - Keep top controls visually anchored and reusable across domains.
 */
// @tags: shared-ui,layout,top-bar
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './LeftColumnTopBar.css';

type LeftColumnTopBarProps = {
  left?: ReactNode;
  right?: ReactNode;
  tone?: 'default' | 'raised';
};

export function LeftColumnTopBar({ left, right, tone = 'default' }: LeftColumnTopBarProps) {
  return (
    <header className={`left-column-top-bar left-column-top-bar-${tone}`} aria-label="Left column controls">
      <div className="left-column-top-bar-left">{left}</div>
      <div className="left-column-top-bar-right">{right}</div>
    </header>
  );
}
