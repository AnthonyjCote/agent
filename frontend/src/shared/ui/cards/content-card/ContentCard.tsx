/**
 * Purpose: Render a spacious content-focused card for main pane settings/forms.
 * Responsibilities:
 * - Provide consistent container treatment with roomier spacing than column cards.
 * - Support optional title/description plus arbitrary body content.
 */
// @tags: shared-ui,surface,card
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import './ContentCard.css';

type ContentCardProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
};

export function ContentCard({ title, description, children, className }: ContentCardProps) {
  const classes = ['content-card', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      {title ? <h3 className="content-card-title">{title}</h3> : null}
      {description ? <p className="content-card-description">{description}</p> : null}
      {children ? <div className="content-card-body">{children}</div> : null}
    </section>
  );
}
