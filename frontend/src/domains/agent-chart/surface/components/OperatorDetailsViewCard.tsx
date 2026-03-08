import { AgentAvatar } from '../../../../shared/ui';
import type { Operator } from '../../../../shared/config';

type OperatorDetailsViewCardProps = {
  operator: Operator;
  orgLabel: string;
  orgUnitId: string;
  reportsToOperator?: Operator;
  directReports: Operator[];
  onOpenOperator: (operatorId: string) => void;
  onOpenOrgUnit: (orgUnitId: string) => void;
  canEdit: boolean;
  onEdit: () => void;
};

export function OperatorDetailsViewCard({
  operator,
  orgLabel,
  orgUnitId,
  reportsToOperator,
  directReports,
  onOpenOperator,
  onOpenOrgUnit,
  canEdit,
  onEdit
}: OperatorDetailsViewCardProps) {
  return (
    <div className="agent-chart-details-view-card">
      <header className="agent-chart-details-view-header">
        <AgentAvatar name={operator.name || 'Operator'} src={operator.avatarDataUrl || undefined} size="xl" shape="circle" />
        <div className="agent-chart-details-view-header-meta">
          <div className="agent-chart-details-view-heading-row">
            <h2>{operator.name || 'Operator'}</h2>
            <button
              type="button"
              className="agent-chart-inline-edit-icon"
              onClick={onEdit}
              disabled={!canEdit}
              aria-label="Edit operator"
              title="Edit operator"
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
          <p>{operator.title || 'Title not set'}</p>
        </div>
      </header>

      <section className="agent-chart-details-view-section">
        <span className="agent-chart-details-view-label">Org Unit</span>
        <p>
          <button
            type="button"
            className="agent-chart-inline-link-button"
            onClick={() => onOpenOrgUnit(orgUnitId)}
          >
            {orgLabel}
          </button>
        </p>
      </section>

      {reportsToOperator ? (
        <section className="agent-chart-details-view-section">
          <span className="agent-chart-details-view-label">Reports To</span>
          <button
            type="button"
            className="agent-chart-related-operator"
            onClick={() => onOpenOperator(reportsToOperator.id)}
          >
            <AgentAvatar
              name={reportsToOperator.name || 'Operator'}
              src={reportsToOperator.avatarDataUrl || undefined}
              size="sm"
              shape="circle"
            />
            <span className="agent-chart-related-operator-meta">
              <span>{reportsToOperator.name || 'Operator'}</span>
              <small>{reportsToOperator.title || 'Role not set'}</small>
            </span>
          </button>
        </section>
      ) : null}

      {directReports.length > 0 ? (
        <section className="agent-chart-details-view-section">
          <span className="agent-chart-details-view-label">Direct Reports</span>
          <div className="agent-chart-related-operator-list">
            {directReports.map((directReport) => (
              <button
                key={directReport.id}
                type="button"
                className="agent-chart-related-operator"
                onClick={() => onOpenOperator(directReport.id)}
              >
                <AgentAvatar
                  name={directReport.name || 'Operator'}
                  src={directReport.avatarDataUrl || undefined}
                  size="sm"
                  shape="circle"
                />
                <span className="agent-chart-related-operator-meta">
                  <span>{directReport.name || 'Operator'}</span>
                  <small>{directReport.title || 'Role not set'}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="agent-chart-details-view-section">
        <span className="agent-chart-details-view-label">Primary Objective</span>
        <p>{operator.primaryObjective?.trim() || 'No primary objective set yet.'}</p>
      </section>

      {operator.kind === 'agent' ? (
        <section className="agent-chart-details-view-section">
          <span className="agent-chart-details-view-label">System Directive</span>
          <p>{operator.systemDirective?.trim() || 'No system directive set yet.'}</p>
        </section>
      ) : (
        <section className="agent-chart-details-view-section">
          <span className="agent-chart-details-view-label">Role Brief</span>
          <p>{operator.roleBrief?.trim() || 'No role brief set yet.'}</p>
        </section>
      )}

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
