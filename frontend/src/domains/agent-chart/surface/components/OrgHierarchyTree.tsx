import { buildOperatorTree, type OperatorTreeNode, type OrgUnitTreeNode } from '@/domains/agent-chart/model';
import type { Operator, OrgUnit } from '@/shared/config';
import type { BusinessUnitTreeNode, SelectedNode } from '@/domains/agent-chart/surface/types';
import { NodeMedia, NodeMediaIcon } from './NodeMedia';
import { CollapseToggleIcon } from './CollapseToggleIcon';

type DndFacade = {
  setRowRef: (kind: 'operator' | 'org_unit' | 'business_unit' | 'scope_bucket', id: string, nodeRef: HTMLButtonElement | null) => void;
  beginRowDragCandidate: (
    event: React.PointerEvent<HTMLButtonElement>,
    payload: { kind: 'operator' | 'org_unit'; id: string }
  ) => void;
  getRowDragState: (kind: 'operator' | 'org_unit' | 'business_unit' | 'scope_bucket', id: string) => {
    isSource: boolean;
    isTarget: boolean;
    placement: 'inside' | 'before' | 'after' | null;
  };
  getDropActionLabel: (kind: 'operator' | 'org_unit' | 'business_unit' | 'scope_bucket', id: string) => string | null;
};

type OrgHierarchyTreeProps = {
  selectedNode: SelectedNode;
  selectedNodeKeys: Set<string>;
  onNodeClick: (next: SelectedNode, options?: { shiftKey?: boolean; appendKey?: boolean }) => void;
  operators: Operator[];
  orgUnits: OrgUnit[];
  businessUnits: Array<{ id: string; logoDataUrl: string }>;
  businessUnitTree: BusinessUnitTreeNode[];
  orgRootsByBusinessUnit: Map<string, OrgUnitTreeNode[]>;
  unassignedOrgRoots: OrgUnitTreeNode[];
  reportCountByManager: Map<string, number>;
  collapsedBusinessUnitIds: Set<string>;
  collapsedOrgUnitIds: Set<string>;
  collapsedActorIds: Set<string>;
  collapsedScopeBuckets: Set<'unassigned'>;
  toggleCollapsedId: (id: string, setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>) => void;
  toggleCollapsedScopeBucket: (scope: 'unassigned') => void;
  setCollapsedBusinessUnitIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCollapsedOrgUnitIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCollapsedActorIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  dnd: DndFacade;
};

export function OrgHierarchyTree(props: OrgHierarchyTreeProps) {
  const {
    selectedNode,
    selectedNodeKeys,
    onNodeClick,
    operators,
    orgUnits,
    businessUnits,
    businessUnitTree,
    orgRootsByBusinessUnit,
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

  const renderTreeGuides = (depth: number) => (
    <span className="agent-chart-tree-guides" style={{ width: `${depth * 18}px` }} aria-hidden="true">
      {Array.from({ length: depth }).map((_, index) => (
        <span key={`guide-${depth}-${index}`} className="agent-chart-tree-guide-line" style={{ left: `${index * 18 + 8}px` }} />
      ))}
      {depth > 0 ? <span className="agent-chart-tree-guide-elbow" style={{ left: `${(depth - 1) * 18 + 8}px` }} /> : null}
    </span>
  );

  const renderActorNode = (node: OperatorTreeNode, depth: number): React.ReactNode => {
    const operator = node.operator;
    const selected =
      selectedNode?.kind === 'operator' && selectedNode.id === operator.id
        ? true
        : selectedNodeKeys.has(`operator:${operator.id}`);
    const reportsCount = reportCountByManager.get(operator.id) ?? 0;
    const hasChildren = node.children.length > 0;
    const collapsed = collapsedActorIds.has(operator.id);
    const dragState = dnd.getRowDragState('operator', operator.id);
    const dropActionLabel = dnd.getDropActionLabel('operator', operator.id);

    return (
      <div key={operator.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-tree-row operator${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}${dragState.isSource ? ' drag-source-hidden' : ''}`}
          onClick={(event) =>
            onNodeClick(
              { kind: 'operator', id: operator.id },
              { shiftKey: event.shiftKey, appendKey: event.metaKey || event.ctrlKey }
            )
          }
          ref={(nodeRef) => dnd.setRowRef('operator', operator.id, nodeRef)}
          onPointerDown={(event) => dnd.beginRowDragCandidate(event, { kind: 'operator', id: operator.id })}
        >
          {renderTreeGuides(depth)}
          <span className="agent-chart-row-card">
            <NodeMedia image={operator.avatarDataUrl} fallback={<NodeMediaIcon kind="operator" actorKind={operator.kind} />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{operator.name}</span>
              <span className="agent-chart-node-meta">
                {operator.title}
                {reportsCount > 0 ? ` · ${reportsCount} report${reportsCount === 1 ? '' : 's'}` : ''}
              </span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(operator.id, setCollapsedActorIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? node.children.map((child) => renderActorNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderOrgNode = (node: OrgUnitTreeNode, depth = 0): React.ReactNode => {
    const selected =
      selectedNode?.kind === 'org_unit' && selectedNode.id === node.unit.id
        ? true
        : selectedNodeKeys.has(`org_unit:${node.unit.id}`);
    const actorTree = buildOperatorTree(operators, node.unit.id);
    const hasChildren = actorTree.length > 0 || node.children.length > 0;
    const collapsed = collapsedOrgUnitIds.has(node.unit.id);
    const dragState = dnd.getRowDragState('org_unit', node.unit.id);
    const dropActionLabel = dnd.getDropActionLabel('org_unit', node.unit.id);
    const beforeClass = dragState.isTarget && dragState.placement === 'before' ? ' drop-before' : '';
    const afterClass = dragState.isTarget && dragState.placement === 'after' ? ' drop-after' : '';
    const insideClass = dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : '';
    const sourceClass = dragState.isSource ? ' drag-source-hidden' : '';

    return (
      <div key={node.unit.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-tree-row org${selected ? ' active' : ''}${beforeClass}${afterClass}${insideClass}${sourceClass}`}
          onClick={(event) =>
            onNodeClick(
              { kind: 'org_unit', id: node.unit.id },
              { shiftKey: event.shiftKey, appendKey: event.metaKey || event.ctrlKey }
            )
          }
          ref={(nodeRef) => dnd.setRowRef('org_unit', node.unit.id, nodeRef)}
          onPointerDown={(event) => dnd.beginRowDragCandidate(event, { kind: 'org_unit', id: node.unit.id })}
        >
          {renderTreeGuides(depth)}
          <span className="agent-chart-row-card">
            <NodeMedia image={node.unit.iconDataUrl} fallback={<NodeMediaIcon kind="org_unit" />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{node.unit.name}</span>
              <span className="agent-chart-node-meta">Org Unit</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(node.unit.id, setCollapsedOrgUnitIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? actorTree.map((actorNode) => renderActorNode(actorNode, depth + 1)) : null}
        {!collapsed ? node.children.map((child) => renderOrgNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderBusinessUnitNode = (node: BusinessUnitTreeNode, depth = 0): React.ReactNode => {
    const assignedCount = orgUnits.filter((unit) => unit.businessUnitId === node.id).length;
    const selected =
      selectedNode?.kind === 'business_unit' && selectedNode.id === node.id
        ? true
        : selectedNodeKeys.has(`business_unit:${node.id}`);
    const attachedOrgRoots = orgRootsByBusinessUnit.get(node.id) ?? [];
    const hasChildren = attachedOrgRoots.length > 0 || node.children.length > 0;
    const collapsed = collapsedBusinessUnitIds.has(node.id);
    const dragState = dnd.getRowDragState('business_unit', node.id);
    const dropActionLabel = dnd.getDropActionLabel('business_unit', node.id);
    const logoDataUrl = businessUnits.find((entry) => entry.id === node.id)?.logoDataUrl;

    return (
      <div key={node.id} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-business-unit-row${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}`}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          onClick={(event) =>
            onNodeClick(
              { kind: 'business_unit', id: node.id },
              { shiftKey: event.shiftKey, appendKey: event.metaKey || event.ctrlKey }
            )
          }
          ref={(nodeRef) => dnd.setRowRef('business_unit', node.id, nodeRef)}
        >
          <span className="agent-chart-row-card">
            <NodeMedia image={logoDataUrl} className="business-unit" fallback={<NodeMediaIcon kind="business_unit" />} />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{node.name}</span>
              <span className="agent-chart-node-meta">{assignedCount} org unit{assignedCount === 1 ? '' : 's'}</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedId(node.id, setCollapsedBusinessUnitIds);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? attachedOrgRoots.map((rootNode) => renderOrgNode(rootNode, depth + 1)) : null}
        {!collapsed ? node.children.map((child) => renderBusinessUnitNode(child, depth + 1)) : null}
      </div>
    );
  };

  const renderScopeBucketNode = (scope: 'unassigned', title: string, roots: OrgUnitTreeNode[]) => {
    const selected =
      selectedNode?.kind === 'scope_bucket' && selectedNode.scope === scope
        ? true
        : selectedNodeKeys.has(`scope_bucket:${scope}`);
    const hasChildren = roots.length > 0;
    const collapsed = collapsedScopeBuckets.has(scope);
    const dragState = dnd.getRowDragState('scope_bucket', scope);
    const dropActionLabel = dnd.getDropActionLabel('scope_bucket', scope);

    return (
      <div key={scope} className="agent-chart-tree-node">
        <button
          type="button"
          className={`agent-chart-business-unit-row${selected ? ' active' : ''}${dragState.isTarget && dragState.placement === 'inside' ? ' drop-inside' : ''}`}
          style={{ paddingLeft: '12px' }}
          onClick={(event) =>
            onNodeClick(
              { kind: 'scope_bucket', scope },
              { shiftKey: event.shiftKey, appendKey: event.metaKey || event.ctrlKey }
            )
          }
          ref={(nodeRef) => dnd.setRowRef('scope_bucket', scope, nodeRef)}
        >
          <span className="agent-chart-row-card">
            <NodeMedia
              image={undefined}
              className="business-unit scope-bucket"
              fallback={<NodeMediaIcon kind="unassigned_bucket" />}
            />
            <span className="agent-chart-node-content">
              <span className="agent-chart-node-title">{title}</span>
              <span className="agent-chart-node-meta">{roots.length} top-level org unit{roots.length === 1 ? '' : 's'}</span>
            </span>
            <span className="agent-chart-row-actions">
              {dropActionLabel ? <span className="agent-chart-drop-action-chip">{dropActionLabel}</span> : null}
              {hasChildren ? (
                <span
                  className={`agent-chart-collapse-toggle${collapsed ? ' is-collapsed' : ' is-open'}`}
                  role="button"
                  aria-label={collapsed ? 'Expand node' : 'Collapse node'}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCollapsedScopeBucket(scope);
                  }}
                >
                  <CollapseToggleIcon collapsed={collapsed} />
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {!collapsed ? roots.map((rootNode) => renderOrgNode(rootNode, 1)) : null}
      </div>
    );
  };

  return (
    <div className="agent-chart-tree" role="tree">
      <div className="agent-chart-tree-section-heading">Organization</div>
      {businessUnitTree.length === 0 ? (
        <div className="agent-chart-tree-section-empty">No business units yet.</div>
      ) : (
        businessUnitTree.map((node) => renderBusinessUnitNode(node))
      )}
      {unassignedOrgRoots.length > 0 ? renderScopeBucketNode('unassigned', 'Unassigned', unassignedOrgRoots) : null}
    </div>
  );
}
