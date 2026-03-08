/**
 * Purpose: Render reusable nav/icon tooltip popovers with directional anchoring variants.
 * Responsibilities:
 * - Support vertical/horizontal host orientation and side/align placement.
 * - Provide consistent speech-bubble tooltip treatment across navigation controls.
 */
// @tags: shared-ui,feedback,tooltip,navigation
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './NavTooltipPopover.css';

type NavTooltipPopoverProps = {
  label: string;
  orientation?: 'vertical' | 'horizontal';
  side?: 'right' | 'left' | 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
};

export function NavTooltipPopover({
  label,
  orientation = 'vertical',
  side = 'right',
  align = 'center'
}: NavTooltipPopoverProps) {
  return (
    <span
      className="nav-tooltip-popover"
      data-orientation={orientation}
      data-side={side}
      data-align={align}
      role="tooltip"
    >
      {label}
    </span>
  );
}
