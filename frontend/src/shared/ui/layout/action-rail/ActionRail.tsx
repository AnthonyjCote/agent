/**
 * Purpose: Provide a reusable full-bleed action rail for workspace surfaces.
 * Responsibilities:
 * - Render consistent left/right action slots inside surface shells.
 * - Keep top controls visually anchored and reusable across domains.
 */
// @tags: shared-ui,layout,top-bar
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './ActionRail.css';

type ActionRailProps = {
  left?: ReactNode;
  right?: ReactNode;
  tone?: 'default' | 'raised';
};

export function ActionRail({ left, right, tone = 'default' }: ActionRailProps) {
  return (
    <header className={`action-rail action-rail-${tone}`} aria-label="Action rail">
      <div className="action-rail-left">{left}</div>
      <div className="action-rail-right">{right}</div>
    </header>
  );
}
