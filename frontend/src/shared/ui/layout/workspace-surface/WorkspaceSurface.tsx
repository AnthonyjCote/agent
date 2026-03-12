/**
 * Purpose: Provide a consistent main workspace shell for right-pane domain content.
 * Responsibilities:
 * - Apply shared background/frame treatment for active work areas.
 * - Keep content full-height with predictable overflow boundaries.
 */
// @tags: shared-ui,layout,workspace
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './WorkspaceSurface.css';

type WorkspaceSurfaceProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceSurface({ children, className }: WorkspaceSurfaceProps) {
  const classes = ['workspace-surface', className].filter(Boolean).join(' ');
  return <section className={classes}>{children}</section>;
}
