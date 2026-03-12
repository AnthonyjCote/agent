/**
 * Purpose: Render agent avatar media with reusable size and shape variants.
 * Responsibilities:
 * - Support shared avatar variants across domains.
 * - Provide robust fallback initials when image is missing.
 */
// @tags: shared-ui,avatar,primitive
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './AgentAvatar.css';

export type AgentAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AgentAvatarShape = 'circle' | 'rounded-square' | 'square';

export type AgentAvatarProps = {
  name: string;
  src?: string;
  size?: AgentAvatarSize;
  shape?: AgentAvatarShape;
  className?: string;
};

function resolveInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'A';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function AgentAvatar({
  name,
  src,
  size = 'md',
  shape = 'circle',
  className
}: AgentAvatarProps) {
  const classes = ['agent-avatar', `size-${size}`, `shape-${shape}`, className]
    .filter(Boolean)
    .join(' ');

  if (src) {
    return <img className={classes} src={src} alt={name} loading="lazy" />;
  }

  return <span className={classes} aria-label={name}>{resolveInitials(name)}</span>;
}
