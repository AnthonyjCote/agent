/**
 * Purpose: Provide a reusable icon-only action button primitive.
 * Responsibilities:
 * - Standardize icon button sizing and interaction states.
 * - Support active/disabled states for navigation and toolbar controls.
 */
// @tags: shared-ui,controls,icon-button
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { ReactNode } from 'react';
import type { MouseEventHandler } from 'react';
import './IconButton.css';

type IconButtonProps = {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  active?: boolean;
  variant?: 'chip' | 'compact-action';
  disabled?: boolean;
  className?: string;
  ariaCurrent?: 'page';
  ariaPressed?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
};

export function IconButton({
  icon,
  ariaLabel,
  onClick,
  active = false,
  variant = 'chip',
  disabled = false,
  className,
  ariaCurrent,
  ariaPressed,
  type = 'button',
  children
}: IconButtonProps) {
  const classes = ['icon-button', `icon-button-${variant}`, active ? 'active' : '', className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      aria-pressed={ariaPressed}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}
