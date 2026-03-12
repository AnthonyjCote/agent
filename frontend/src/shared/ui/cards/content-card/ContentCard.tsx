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
  as?: 'section' | 'button';
  active?: boolean;
  onClick?: () => void;
  ariaCurrent?: 'page';
};

export function ContentCard({
  title,
  description,
  children,
  className,
  as = 'section',
  active = false,
  onClick,
  ariaCurrent
}: ContentCardProps) {
  const classes = ['content-card', as === 'button' ? 'is-interactive' : '', active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ');

  if (as === 'button') {
    return (
      <button type="button" className={classes} onClick={onClick} aria-current={ariaCurrent}>
        {title ? <h3 className="content-card-title">{title}</h3> : null}
        {description ? <p className="content-card-description">{description}</p> : null}
        {children ? (title || description ? <div className="content-card-body">{children}</div> : children) : null}
      </button>
    );
  }

  return (
    <section className={classes}>
      {title ? <h3 className="content-card-title">{title}</h3> : null}
      {description ? <p className="content-card-description">{description}</p> : null}
      {children ? (title || description ? <div className="content-card-body">{children}</div> : children) : null}
    </section>
  );
}
