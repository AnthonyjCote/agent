/**
 * Purpose: Render the global left rail navigation for top-level app views.
 * Responsibilities:
 * - Map view registry entries to consistent rail icon buttons.
 * - Reflect and update active view state in the shell.
 */
// @tags: app,shell,global-rail,navigation
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import type { ViewMode } from './model/ui-contract';
import { VIEW_DEFINITIONS, VIEW_ORDER } from './view-registry';
import { NavTooltipPopover } from '../../shared/ui';
import './GlobalRail.css';

type GlobalRailProps = {
  viewMode: ViewMode;
  setViewMode: (next: ViewMode) => void;
};

function RailIcon({ mode }: { mode: ViewMode }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true } as const;

  switch (mode) {
    case 'chat-gui':
      return (
        <svg {...common}>
          <path
            d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'comms':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m5.5 7.5 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'agent-cards':
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M4.8 17.2c.7-2.2 2.1-3.2 4.2-3.2s3.5 1 4.2 3.2M10.8 17.2c.7-2.2 2.1-3.2 4.2-3.2s3.5 1 4.2 3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'agent-chart':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="15" y="4" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="9.5" y="15" width="5" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 6.5h6M12 9v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'app-settings':
      return (
        <svg {...common}>
          <path
            d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="m19 12-1.7.6-.4 1.1 1 1.5-1.7 1.7-1.5-1-.9.4-.6 1.7h-2.4l-.6-1.7-.9-.4-1.5 1-1.7-1.7 1-1.5-.4-.9L5 12v-2.4l1.7-.6.4-.9-1-1.5 1.7-1.7 1.5 1 .9-.4.6-1.7h2.4l.6 1.7.9.4 1.5-1 1.7 1.7-1 1.5.4.9 1.7.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function GlobalRail({ viewMode, setViewMode }: GlobalRailProps) {
  const settingsMode: ViewMode = 'app-settings';
  const topModes = VIEW_ORDER.filter((mode) => mode !== settingsMode);

  return (
    <nav className="global-rail" aria-label="Primary">
      <div className="global-rail-group">
        {topModes.map((mode) => {
          const def = VIEW_DEFINITIONS[mode];
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`rail-item nav-tooltip-host${active ? ' active' : ''}`}
              aria-label={def.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => setViewMode(mode)}
            >
              <RailIcon mode={mode} />
              <NavTooltipPopover label={def.label} orientation="vertical" side="right" align="center" />
            </button>
          );
        })}
      </div>
      <div className="global-rail-group bottom">
        <button
          type="button"
          className={`rail-item nav-tooltip-host${viewMode === settingsMode ? ' active' : ''}`}
          aria-label={VIEW_DEFINITIONS[settingsMode].label}
          aria-current={viewMode === settingsMode ? 'page' : undefined}
          onClick={() => setViewMode(settingsMode)}
        >
          <RailIcon mode={settingsMode} />
          <NavTooltipPopover label={VIEW_DEFINITIONS[settingsMode].label} orientation="vertical" side="right" align="center" />
        </button>
      </div>
    </nav>
  );
}
