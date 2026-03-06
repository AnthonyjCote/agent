/**
 * Purpose: Provide a reusable premium text-based action button.
 * Responsibilities:
 * - Standardize primary, secondary, ghost, and danger actions.
 * - Keep button treatment consistent across shared and domain surfaces.
 */
// @tags: shared-ui,controls,button
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './TextButton.css';

type TextButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type TextButtonSize = 'sm' | 'md';

type TextButtonProps = {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: TextButtonVariant;
  size?: TextButtonSize;
  disabled?: boolean;
  className?: string;
};

export function TextButton({
  label,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className
}: TextButtonProps) {
  const classes = ['text-button', `text-button-${variant}`, `text-button-${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
