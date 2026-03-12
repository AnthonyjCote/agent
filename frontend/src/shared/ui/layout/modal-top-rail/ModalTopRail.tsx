/**
 * Purpose: Provide a reusable full-bleed top rail for large modal content.
 * Responsibilities:
 * - Render consistent left/right compact controls within modal body shells.
 * - Keep modal-level control bars visually distinct from card/grid content.
 */
// @tags: shared-ui,layout,modal-top-rail
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './ModalTopRail.css';

type ModalTopRailProps = {
  left?: ReactNode;
  right?: ReactNode;
  tone?: 'default' | 'raised';
};

export function ModalTopRail({ left, right, tone = 'raised' }: ModalTopRailProps) {
  return (
    <header className={`modal-top-rail modal-top-rail-${tone}`} aria-label="Modal top rail controls">
      <div className="modal-top-rail-left">{left}</div>
      <div className="modal-top-rail-right">{right}</div>
    </header>
  );
}
