import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Operator, BusinessUnit, OrgUnit, OrgUnitScope } from '../../../../shared/config';
import type { DropdownOption } from '../../../../shared/ui';
import type { SelectedNode } from '../types';

const ORG_SCOPE_LABELS: Record<OrgUnitScope, string> = {
  business_unit: 'Business Unit',
  shared: 'Shared',
  unassigned: 'Unassigned'
};

function findTopLevelOrgUnit(units: OrgUnit[], orgUnitId: string): OrgUnit | undefined {
  let cursor = units.find((unit) => unit.id === orgUnitId);
  while (cursor?.parentOrgUnitId) {
    cursor = units.find((unit) => unit.id === cursor?.parentOrgUnitId);
  }
  return cursor;
}

export type OrgChartSelectionState = {
  selectedNode: SelectedNode;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  workspaceView: 'list' | 'canvas';
  setWorkspaceView: Dispatch<SetStateAction<'list' | 'canvas'>>;
  hierarchyMode: boolean;
  setHierarchyMode: Dispatch<SetStateAction<boolean>>;
  selectedBusinessUnit: BusinessUnit | undefined;
  selectedOrg: OrgUnit | undefined;
  selectedOperator: Operator | undefined;
  selectedOrgTopLevel: OrgUnit | undefined;
  selectedOrgChildren: OrgUnit[];
  selectedOrgIsTopLevel: boolean;
  selectedOrgEffectiveScope: OrgUnitScope;
  selectedOrgEffectiveBusinessUnitId: string | null;
  selectedOrgEffectiveBusinessUnitName: string | null;
  orgNameDraft: string;
  setOrgNameDraft: Dispatch<SetStateAction<string>>;
  businessUnitNameDraft: string;
  setBusinessUnitNameDraft: Dispatch<SetStateAction<string>>;
  actorNameDraft: string;
  setActorNameDraft: Dispatch<SetStateAction<string>>;
  actorTitleDraft: string;
  setActorTitleDraft: Dispatch<SetStateAction<string>>;
  businessUnitOverviewDraft: string;
  setBusinessUnitOverviewDraft: Dispatch<SetStateAction<string>>;
  businessUnitObjectivesDraft: string;
  setBusinessUnitObjectivesDraft: Dispatch<SetStateAction<string>>;
  businessUnitProductsDraft: string;
  setBusinessUnitProductsDraft: Dispatch<SetStateAction<string>>;
  businessUnitMetricsDraft: string;
  setBusinessUnitMetricsDraft: Dispatch<SetStateAction<string>>;
  orgOverviewDraft: string;
  setOrgOverviewDraft: Dispatch<SetStateAction<string>>;
  orgResponsibilitiesDraft: string;
  setOrgResponsibilitiesDraft: Dispatch<SetStateAction<string>>;
  orgDeliverablesDraft: string;
  setOrgDeliverablesDraft: Dispatch<SetStateAction<string>>;
  orgWorkingModelDraft: OrgUnit['workingModel'];
  setOrgWorkingModelDraft: Dispatch<SetStateAction<OrgUnit['workingModel']>>;
  actorPrimaryObjectiveDraft: string;
  setActorPrimaryObjectiveDraft: Dispatch<SetStateAction<string>>;
  actorSystemDirectiveDraft: string;
  setActorSystemDirectiveDraft: Dispatch<SetStateAction<string>>;
  actorRoleBriefDraft: string;
  setActorRoleBriefDraft: Dispatch<SetStateAction<string>>;
  orgOptions: DropdownOption[];
  businessUnitOptions: DropdownOption[];
  orgScopeOptions: DropdownOption[];
  orgParentOptions: DropdownOption[];
  businessUnitParentOptions: DropdownOption[];
  managerOptions: DropdownOption[];
  actorTypeOptions: DropdownOption[];
  scopeLabels: Record<OrgUnitScope, string>;
};

export function useOrgChartSelectionState(input: {
  businessUnits: BusinessUnit[];
  orgUnits: OrgUnit[];
  operators: Operator[];
  getOrgUnitById: (id: string) => OrgUnit | undefined;
  getOperatorById: (id: string) => Operator | undefined;
}): OrgChartSelectionState {
  const { businessUnits, orgUnits, operators, getOrgUnitById, getOperatorById } = input;

  const [hierarchyMode, setHierarchyMode] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'list' | 'canvas'>('list');
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  const [orgNameDraft, setOrgNameDraft] = useState('');
  const [businessUnitNameDraft, setBusinessUnitNameDraft] = useState('');
  const [businessUnitOverviewDraft, setBusinessUnitOverviewDraft] = useState('');
  const [businessUnitObjectivesDraft, setBusinessUnitObjectivesDraft] = useState('');
  const [businessUnitProductsDraft, setBusinessUnitProductsDraft] = useState('');
  const [businessUnitMetricsDraft, setBusinessUnitMetricsDraft] = useState('');
  const [actorNameDraft, setActorNameDraft] = useState('');
  const [actorTitleDraft, setActorTitleDraft] = useState('');
  const [orgOverviewDraft, setOrgOverviewDraft] = useState('');
  const [orgResponsibilitiesDraft, setOrgResponsibilitiesDraft] = useState('');
  const [orgDeliverablesDraft, setOrgDeliverablesDraft] = useState('');
  const [orgWorkingModelDraft, setOrgWorkingModelDraft] = useState<OrgUnit['workingModel']>('hybrid');
  const [actorPrimaryObjectiveDraft, setActorPrimaryObjectiveDraft] = useState('');
  const [actorSystemDirectiveDraft, setActorSystemDirectiveDraft] = useState('');
  const [actorRoleBriefDraft, setActorRoleBriefDraft] = useState('');
  const lastSelectionKeyRef = useRef<string | null>(null);

  const selectedBusinessUnit =
    selectedNode?.kind === 'business_unit' ? businessUnits.find((unit) => unit.id === selectedNode.id) : undefined;
  const selectedOrg = selectedNode?.kind === 'org_unit' ? getOrgUnitById(selectedNode.id) : undefined;
  const selectedOperator = selectedNode?.kind === 'operator' ? getOperatorById(selectedNode.id) : undefined;

  const selectedOrgTopLevel = useMemo(
    () => (selectedOrg ? findTopLevelOrgUnit(orgUnits, selectedOrg.id) : undefined),
    [orgUnits, selectedOrg]
  );

  const selectedOrgChildren = useMemo(
    () => (selectedOrg ? orgUnits.filter((unit) => unit.parentOrgUnitId === selectedOrg.id) : []),
    [orgUnits, selectedOrg]
  );

  const selectedOrgIsTopLevel = selectedOrg != null && selectedOrg.parentOrgUnitId == null;
  const selectedOrgEffectiveBusinessUnitId = selectedOrgTopLevel?.businessUnitId ?? selectedOrg?.businessUnitId ?? null;
  const selectedOrgEffectiveBusinessUnitName =
    selectedOrgEffectiveBusinessUnitId != null
      ? businessUnits.find((unit) => unit.id === selectedOrgEffectiveBusinessUnitId)?.name ?? null
      : null;
  const selectedOrgEffectiveScope: OrgUnitScope = selectedOrgTopLevel?.scope ?? selectedOrg?.scope ?? 'unassigned';

  useEffect(() => {
    const selectionKey = selectedNode
      ? selectedNode.kind === 'scope_bucket'
        ? `${selectedNode.kind}:${selectedNode.scope}`
        : `${selectedNode.kind}:${selectedNode.id}`
      : null;
    if (selectionKey === lastSelectionKeyRef.current) {
      return;
    }
    lastSelectionKeyRef.current = selectionKey;

    if (selectedBusinessUnit) {
      setBusinessUnitNameDraft(selectedBusinessUnit.name);
      setBusinessUnitOverviewDraft(selectedBusinessUnit.overview);
      setBusinessUnitObjectivesDraft(selectedBusinessUnit.objectives);
      setBusinessUnitProductsDraft(selectedBusinessUnit.primaryProductsOrServices);
      setBusinessUnitMetricsDraft(selectedBusinessUnit.successMetrics);
      setOrgNameDraft('');
      setOrgOverviewDraft('');
      setOrgResponsibilitiesDraft('');
      setOrgDeliverablesDraft('');
      setOrgWorkingModelDraft('hybrid');
      setActorNameDraft('');
      setActorTitleDraft('');
      setActorPrimaryObjectiveDraft('');
      setActorSystemDirectiveDraft('');
      setActorRoleBriefDraft('');
      return;
    }

    if (selectedOrg) {
      setOrgNameDraft(selectedOrg.name);
      setOrgOverviewDraft(selectedOrg.overview);
      setOrgResponsibilitiesDraft(selectedOrg.coreResponsibilities);
      setOrgDeliverablesDraft(selectedOrg.primaryDeliverables);
      setOrgWorkingModelDraft(selectedOrg.workingModel);
      setBusinessUnitNameDraft('');
      setBusinessUnitOverviewDraft('');
      setBusinessUnitObjectivesDraft('');
      setBusinessUnitProductsDraft('');
      setBusinessUnitMetricsDraft('');
      setActorNameDraft('');
      setActorTitleDraft('');
      setActorPrimaryObjectiveDraft('');
      setActorSystemDirectiveDraft('');
      setActorRoleBriefDraft('');
      return;
    }

    if (selectedOperator) {
      setActorNameDraft(selectedOperator.name);
      setActorTitleDraft(selectedOperator.title);
      setActorPrimaryObjectiveDraft(selectedOperator.primaryObjective);
      setActorSystemDirectiveDraft(selectedOperator.systemDirective);
      setActorRoleBriefDraft(selectedOperator.roleBrief);
      setBusinessUnitNameDraft('');
      setBusinessUnitOverviewDraft('');
      setBusinessUnitObjectivesDraft('');
      setBusinessUnitProductsDraft('');
      setBusinessUnitMetricsDraft('');
      setOrgNameDraft('');
      setOrgOverviewDraft('');
      setOrgResponsibilitiesDraft('');
      setOrgDeliverablesDraft('');
      setOrgWorkingModelDraft('hybrid');
      return;
    }

    setBusinessUnitNameDraft('');
    setBusinessUnitOverviewDraft('');
    setBusinessUnitObjectivesDraft('');
    setBusinessUnitProductsDraft('');
    setBusinessUnitMetricsDraft('');
    setOrgNameDraft('');
    setOrgOverviewDraft('');
    setOrgResponsibilitiesDraft('');
    setOrgDeliverablesDraft('');
    setOrgWorkingModelDraft('hybrid');
    setActorNameDraft('');
    setActorTitleDraft('');
    setActorPrimaryObjectiveDraft('');
    setActorSystemDirectiveDraft('');
    setActorRoleBriefDraft('');
  }, [selectedNode, selectedBusinessUnit, selectedOrg, selectedOperator]);

  const orgOptions = useMemo<DropdownOption[]>(
    () => orgUnits.map((unit) => ({ value: unit.id, label: unit.name })),
    [orgUnits]
  );

  const businessUnitOptions = useMemo<DropdownOption[]>(
    () => [{ value: '', label: 'Unassigned' }, ...businessUnits.map((unit) => ({ value: unit.id, label: unit.name }))],
    [businessUnits]
  );

  const orgScopeOptions: DropdownOption[] = [
    { value: 'business_unit', label: ORG_SCOPE_LABELS.business_unit },
    { value: 'shared', label: ORG_SCOPE_LABELS.shared },
    { value: 'unassigned', label: ORG_SCOPE_LABELS.unassigned }
  ];

  const orgParentOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedOrg) {
      return [{ value: '', label: 'No parent (top-level)' }];
    }

    return [
      { value: '', label: 'No parent (top-level)' },
      ...orgUnits.filter((unit) => unit.id !== selectedOrg.id).map((unit) => ({ value: unit.id, label: unit.name }))
    ];
  }, [orgUnits, selectedOrg]);

  const businessUnitParentOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedBusinessUnit) {
      return [{ value: '', label: 'No parent' }];
    }
    return [
      { value: '', label: 'No parent' },
      ...businessUnits
        .filter((unit) => unit.id !== selectedBusinessUnit.id)
        .map((unit) => ({ value: unit.id, label: unit.name }))
    ];
  }, [businessUnits, selectedBusinessUnit]);

  const managerOptions = useMemo<DropdownOption[]>(() => {
    if (!selectedOperator) {
      return [{ value: '', label: 'No manager' }];
    }

    return [
      { value: '', label: 'No manager' },
      ...operators
        .filter((operator) => operator.id !== selectedOperator.id)
        .map((operator) => ({ value: operator.id, label: `${operator.name} (${operator.title})` }))
    ];
  }, [operators, selectedOperator]);

  const actorTypeOptions: DropdownOption[] = [
    { value: 'agent', label: 'Agent' },
    { value: 'human', label: 'Human' }
  ];

  return {
    selectedNode,
    setSelectedNode,
    workspaceView,
    setWorkspaceView,
    hierarchyMode,
    setHierarchyMode,
    selectedBusinessUnit,
    selectedOrg,
    selectedOperator,
    selectedOrgTopLevel,
    selectedOrgChildren,
    selectedOrgIsTopLevel,
    selectedOrgEffectiveScope,
    selectedOrgEffectiveBusinessUnitId,
    selectedOrgEffectiveBusinessUnitName,
    orgNameDraft,
    setOrgNameDraft,
    businessUnitNameDraft,
    setBusinessUnitNameDraft,
    actorNameDraft,
    setActorNameDraft,
    actorTitleDraft,
    setActorTitleDraft,
    businessUnitOverviewDraft,
    setBusinessUnitOverviewDraft,
    businessUnitObjectivesDraft,
    setBusinessUnitObjectivesDraft,
    businessUnitProductsDraft,
    setBusinessUnitProductsDraft,
    businessUnitMetricsDraft,
    setBusinessUnitMetricsDraft,
    orgOverviewDraft,
    setOrgOverviewDraft,
    orgResponsibilitiesDraft,
    setOrgResponsibilitiesDraft,
    orgDeliverablesDraft,
    setOrgDeliverablesDraft,
    orgWorkingModelDraft,
    setOrgWorkingModelDraft,
    actorPrimaryObjectiveDraft,
    setActorPrimaryObjectiveDraft,
    actorSystemDirectiveDraft,
    setActorSystemDirectiveDraft,
    actorRoleBriefDraft,
    setActorRoleBriefDraft,
    orgOptions,
    businessUnitOptions,
    orgScopeOptions,
    orgParentOptions,
    businessUnitParentOptions,
    managerOptions,
    actorTypeOptions,
    scopeLabels: ORG_SCOPE_LABELS
  };
}
