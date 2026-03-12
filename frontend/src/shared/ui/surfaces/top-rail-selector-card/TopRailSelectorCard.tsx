import { useMemo } from 'react';
import { useAgentManifestStore, useOrgChartStore } from '@/shared/config';
import { AgentAvatar } from '@/shared/ui/avatar';
import { resolveAvatarSrc } from '@/shared/ui/avatar/resolveAvatarSrc';
import './TopRailSelectorCard.css';

type TopRailSelectorCardProps = {
  operatorId?: string;
  name: string;
  subtitle: string;
  avatarSrc?: string;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
};

export function TopRailSelectorCard({
  operatorId,
  name,
  subtitle,
  avatarSrc,
  onClick,
  className,
  ariaLabel
}: TopRailSelectorCardProps) {
  const { operators } = useOrgChartStore();
  const { agents } = useAgentManifestStore();
  const resolvedAvatarSrc = useMemo(
    () =>
      resolveAvatarSrc({
        explicitAvatarSrc: avatarSrc,
        operatorId,
        name,
        operators,
        manifests: agents
      }),
    [agents, avatarSrc, name, operatorId, operators]
  );

  const classes = ['top-rail-selector-card', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-label={ariaLabel || `Select ${name}`}
      title={subtitle}
    >
      <AgentAvatar name={name} src={resolvedAvatarSrc} size="sm" shape="circle" />
      <div className="top-rail-selector-copy">
        <strong>{name}</strong>
        <span>{subtitle}</span>
      </div>
    </button>
  );
}
