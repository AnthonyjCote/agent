/**
 * Purpose: Render a centered empty-state scaffold for full-bleed working surfaces.
 * Responsibilities:
 * - Provide consistent centered anatomy for avatar, prompt, and action content.
 * - Keep spacing/layout reusable across domains.
 */
// @tags: shared-ui,empty-state,shell
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './CenteredEmptyState.css';

type CenteredEmptyStateProps = {
  lead: ReactNode;
  prompt: ReactNode;
  action: ReactNode;
};

export function CenteredEmptyState({ lead, prompt, action }: CenteredEmptyStateProps) {
  return (
    <section className="centered-empty-state" aria-label="Empty state">
      <div className="centered-empty-lead">{lead}</div>
      <p className="centered-empty-prompt">{prompt}</p>
      <div className="centered-empty-action">{action}</div>
    </section>
  );
}
