type CollapseToggleIconProps = {
  collapsed: boolean;
};

export function CollapseToggleIcon({ collapsed }: CollapseToggleIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`agent-chart-collapse-icon${collapsed ? ' is-collapsed' : ' is-open'}`}>
      <g className="agent-chart-collapse-icon-hamburger">
        <line x1="5.2" y1="6.2" x2="14.8" y2="6.2" />
        <line x1="5.2" y1="10" x2="14.8" y2="10" />
        <line x1="5.2" y1="13.8" x2="14.8" y2="13.8" />
      </g>
      <path className="agent-chart-collapse-icon-chevron" d="m5.4 7.2 4.6 6 4.6-6" />
    </svg>
  );
}

