/**
 * Purpose: Render org-chart drag chip overlay during pointer-driven hierarchy moves.
 * Responsibilities:
 * - Mirror active pointer location with drag payload metadata.
 * - Provide a clear visual that source row is currently being dragged.
 */
// @tags: domain,agent-chart,surface,dnd
// @status: active
// @owner: founder
// @domain: agent-chart
// @adr: none

type OrgChartDragChipProps = {
  chip: {
    x: number;
    y: number;
    label: string;
    category: string;
  } | null;
};

export function OrgChartDragChip({ chip }: OrgChartDragChipProps) {
  if (!chip) {
    return null;
  }

  return (
    <div
      className="agent-chart-drag-chip"
      style={{
        left: `${chip.x + 14}px`,
        top: `${chip.y + 14}px`
      }}
      aria-hidden="true"
    >
      <span className="agent-chart-drag-chip-plus">+</span>
      <span className="agent-chart-drag-chip-icon">◉</span>
      <span className="agent-chart-drag-chip-meta">
        <strong>{chip.label}</strong>
        <small>{chip.category}</small>
      </span>
    </div>
  );
}
