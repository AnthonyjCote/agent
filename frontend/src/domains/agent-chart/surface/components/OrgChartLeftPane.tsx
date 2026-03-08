import type { Dispatch, SetStateAction } from 'react';
import { LeftColumnTopBar, NavTooltipPopover } from '../../../../shared/ui';
import type { Actor, BusinessUnit, OrgUnit } from '../../../../shared/config';
import type { BusinessUnitTreeNode, SelectedNode } from '../types';
import { useOrgChartPointerDnd, type OrgUnitTreeNode } from '../../model';
import { OrgHierarchyTree } from './OrgHierarchyTree';

type ScopeBucket = 'shared' | 'unassigned';

type OrgChartLeftPaneProps = {
  errorMessage: string;
  onAddOrgUnit: () => void;
  onAddBusinessUnit: () => void;
  onAddActor: () => void;
  hierarchyMode: boolean;
  onToggleHierarchyMode: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedNode: SelectedNode;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  actors: Actor[];
  orgUnits: OrgUnit[];
  businessUnits: BusinessUnit[];
  businessUnitTree: BusinessUnitTreeNode[];
  orgRootsByBusinessUnit: Map<string, OrgUnitTreeNode[]>;
  sharedOrgRoots: OrgUnitTreeNode[];
  unassignedOrgRoots: OrgUnitTreeNode[];
  reportCountByManager: Map<string, number>;
  collapsedBusinessUnitIds: Set<string>;
  collapsedOrgUnitIds: Set<string>;
  collapsedActorIds: Set<string>;
  collapsedScopeBuckets: Set<ScopeBucket>;
  toggleCollapsedId: (id: string, setter: Dispatch<SetStateAction<Set<string>>>) => void;
  toggleCollapsedScopeBucket: (scope: ScopeBucket) => void;
  setCollapsedBusinessUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedOrgUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setCollapsedActorIds: Dispatch<SetStateAction<Set<string>>>;
  dnd: ReturnType<typeof useOrgChartPointerDnd>;
};

export function OrgChartLeftPane(props: OrgChartLeftPaneProps) {
  const {
    errorMessage,
    onAddOrgUnit,
    onAddBusinessUnit,
    onAddActor,
    hierarchyMode,
    onToggleHierarchyMode,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    selectedNode,
    setSelectedNode,
    actors,
    orgUnits,
    businessUnits,
    businessUnitTree,
    orgRootsByBusinessUnit,
    sharedOrgRoots,
    unassignedOrgRoots,
    reportCountByManager,
    collapsedBusinessUnitIds,
    collapsedOrgUnitIds,
    collapsedActorIds,
    collapsedScopeBuckets,
    toggleCollapsedId,
    toggleCollapsedScopeBucket,
    setCollapsedBusinessUnitIds,
    setCollapsedOrgUnitIds,
    setCollapsedActorIds,
    dnd
  } = props;

  return (
    <section className="agent-chart-left-pane" aria-label="Org hierarchy">
      <LeftColumnTopBar
        tone="raised"
        left={
          <div className="agent-chart-icon-actions">
            <button type="button" className="agent-chart-icon-button nav-tooltip-host" onClick={onAddOrgUnit} aria-label="Add org unit">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3.5" y="3.5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M14.5 10v4.5M12.25 12.25h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Org Unit" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={onAddBusinessUnit}
              aria-label="Add business unit"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <rect x="3" y="4.8" width="6.2" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <rect x="10.6" y="3.6" width="6.2" height="12" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M13.7 6.8v4.2M11.6 8.9h4.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Business Unit" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button type="button" className="agent-chart-icon-button nav-tooltip-host" onClick={onAddActor} aria-label="Add actor">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8" cy="7" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3.9 14.8c.6-2 2-3.1 4.1-3.1s3.5 1.1 4.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M14.8 10.4v4.4M12.6 12.6H17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <NavTooltipPopover label="Add Actor" orientation="horizontal" side="bottom" align="start" />
            </button>
            <button
              type="button"
              className={`agent-chart-icon-button nav-tooltip-host${hierarchyMode ? ' active' : ''}`}
              onClick={onToggleHierarchyMode}
              aria-label="Toggle hierarchy edit mode"
              aria-pressed={hierarchyMode}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M6.5 4.2v11.6M6.5 4.2 4.2 6.5M6.5 4.2l2.3 2.3M13.5 15.8V4.2M13.5 15.8l-2.3-2.3M13.5 15.8l2.3-2.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Re-Org Mode" orientation="horizontal" side="bottom" align="start" />
            </button>
          </div>
        }
        right={
          <div className="agent-chart-history-actions">
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7.8 6.2 4.2 9.8l3.6 3.6M5 9.8h6.4a4.2 4.2 0 1 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Undo" orientation="horizontal" side="bottom" align="end" />
            </button>
            <button
              type="button"
              className="agent-chart-icon-button nav-tooltip-host"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m12.2 6.2 3.6 3.6-3.6 3.6M15 9.8H8.6a4.2 4.2 0 1 0 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <NavTooltipPopover label="Redo" orientation="horizontal" side="bottom" align="end" />
            </button>
          </div>
        }
      />

      {errorMessage ? <p className="agent-chart-error-banner">{errorMessage}</p> : null}

      <OrgHierarchyTree
        selectedNode={selectedNode}
        setSelectedNode={setSelectedNode}
        actors={actors}
        orgUnits={orgUnits}
        businessUnits={businessUnits}
        businessUnitTree={businessUnitTree}
        orgRootsByBusinessUnit={orgRootsByBusinessUnit}
        sharedOrgRoots={sharedOrgRoots}
        unassignedOrgRoots={unassignedOrgRoots}
        reportCountByManager={reportCountByManager}
        collapsedBusinessUnitIds={collapsedBusinessUnitIds}
        collapsedOrgUnitIds={collapsedOrgUnitIds}
        collapsedActorIds={collapsedActorIds}
        collapsedScopeBuckets={collapsedScopeBuckets}
        toggleCollapsedId={toggleCollapsedId}
        toggleCollapsedScopeBucket={toggleCollapsedScopeBucket}
        setCollapsedBusinessUnitIds={setCollapsedBusinessUnitIds}
        setCollapsedOrgUnitIds={setCollapsedOrgUnitIds}
        setCollapsedActorIds={setCollapsedActorIds}
        dnd={dnd}
      />
    </section>
  );
}
