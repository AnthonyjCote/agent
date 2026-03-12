import { AgentAvatar } from '@/shared/ui';

type OrgUnit = {
  name: string;
  shortDescription: string;
  iconDataUrl: string;
};

type OrgUnitDetailsViewCardProps = {
  orgUnit: OrgUnit;
  subUnitCount: number;
  effectiveBusinessUnitLabel: string;
  canEdit: boolean;
  onEdit: () => void;
};

export function OrgUnitDetailsViewCard({
  orgUnit,
  subUnitCount,
  effectiveBusinessUnitLabel,
  canEdit,
  onEdit
}: OrgUnitDetailsViewCardProps) {
  return (
    <div className="agent-chart-details-view-card">
      <header className="agent-chart-details-view-header">
        <AgentAvatar name={orgUnit.name || 'Org Unit'} src={orgUnit.iconDataUrl || undefined} size="xl" shape="circle" />
        <div className="agent-chart-details-view-header-meta">
          <div className="agent-chart-details-view-heading-row">
            <h2>{orgUnit.name || 'Org Unit'}</h2>
            <button
              type="button"
              className="agent-chart-inline-edit-icon"
              onClick={onEdit}
              disabled={!canEdit}
              aria-label="Edit org unit"
              title="Edit org unit"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M12.9 3.6 16.4 7.1M4 16l3.1-.4L15.5 7.2a1.4 1.4 0 0 0 0-2l-.8-.8a1.4 1.4 0 0 0-2 0L4.4 12.8 4 16Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p>Org Unit</p>
        </div>
      </header>

      <section className="agent-chart-details-view-grid">
        <article>
          <span>Business Unit</span>
          <strong>{effectiveBusinessUnitLabel}</strong>
        </article>
        <article>
          <span>Sub-Units</span>
          <strong>{subUnitCount}</strong>
        </article>
      </section>

      <section className="agent-chart-details-view-section">
        <span className="agent-chart-details-view-label">Short Description</span>
        <p>{orgUnit.shortDescription?.trim() || 'No short description yet.'}</p>
      </section>

      <section className="agent-chart-details-view-grid">
        <article>
          <span className="agent-chart-details-view-label">Associated Docs</span>
          <strong>Coming Soon</strong>
        </article>
        <article>
          <span className="agent-chart-details-view-label">Tasks</span>
          <strong>Coming Soon</strong>
        </article>
        <article>
          <span className="agent-chart-details-view-label">Calendar</span>
          <strong>Coming Soon</strong>
        </article>
        <article>
          <span className="agent-chart-details-view-label">Comms</span>
          <strong>Coming Soon</strong>
        </article>
      </section>
    </div>
  );
}
