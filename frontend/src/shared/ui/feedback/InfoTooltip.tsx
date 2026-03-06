/**
 * Purpose: Provide reusable inline info tooltip icon with hover/focus popover.
 * Responsibilities:
 * - Render compact help affordance for form fields and UI controls.
 * - Show contextual guidance without cluttering primary layout.
 */
// @tags: shared-ui,tooltip,help
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './InfoTooltip.css';

type InfoTooltipProps = {
  content: string;
};

export function InfoTooltip({ content }: InfoTooltipProps) {
  return (
    <span className="info-tooltip-root">
      <button type="button" className="info-tooltip-trigger" aria-label="Field help">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10 8.2v4.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="6" r="0.85" fill="currentColor" />
        </svg>
      </button>
      <span className="info-tooltip-popover" role="tooltip">
        {content}
      </span>
    </span>
  );
}
