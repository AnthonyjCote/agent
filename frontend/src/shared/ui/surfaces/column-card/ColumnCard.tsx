/**
 * Purpose: Render a reusable stacked surface card for column-based UIs.
 * Responsibilities:
 * - Provide consistent card container with optional heading/description.
 * - Keep card primitive domain-neutral for broad reuse.
 */
// @tags: shared-ui,surface,card
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './ColumnCard.css';

type ColumnCardProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
};

export function ColumnCard({ title, description, children }: ColumnCardProps) {
  return (
    <section className="column-card">
      {title ? <h3 className="column-card-title">{title}</h3> : null}
      {description ? <p className="column-card-description">{description}</p> : null}
      {children ? <div className="column-card-body">{children}</div> : null}
    </section>
  );
}
