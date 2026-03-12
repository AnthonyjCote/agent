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
  className?: string;
  as?: 'section' | 'button';
  active?: boolean;
  onClick?: () => void;
  ariaCurrent?: 'page';
};

export function ColumnCard({
  title,
  description,
  children,
  className,
  as = 'section',
  active = false,
  onClick,
  ariaCurrent
}: ColumnCardProps) {
  const classes = ['column-card', as === 'button' ? 'is-interactive' : '', active ? 'is-active' : '', className]
    .filter(Boolean)
    .join(' ');

  if (as === 'button') {
    return (
      <button type="button" className={classes} onClick={onClick} aria-current={ariaCurrent}>
        {title ? <h3 className="column-card-title">{title}</h3> : null}
        {description ? <p className="column-card-description">{description}</p> : null}
        {children ? <div className="column-card-body">{children}</div> : null}
      </button>
    );
  }

  return (
    <section className={classes}>
      {title ? <h3 className="column-card-title">{title}</h3> : null}
      {description ? <p className="column-card-description">{description}</p> : null}
      {children ? <div className="column-card-body">{children}</div> : null}
    </section>
  );
}
