import { useState, type Dispatch, type SetStateAction } from 'react';
import type { OrgCommand } from '../../../../shared/config';
import type { PendingDelete, SelectedNode } from '../types';

type UseOrgChartSurfaceActionsInput = {
  execute: (command: OrgCommand) => { ok: boolean; message?: string };
  selectedNode: SelectedNode;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  orgUnits: Array<{ id: string }>;
  getOperatorById: (id: string) => { orgUnitId: string } | undefined;
};

type OrgChartSurfaceActions = {
  errorMessage: string;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  pendingDelete: PendingDelete;
  setPendingDelete: Dispatch<SetStateAction<PendingDelete>>;
  executeCommand: (command: OrgCommand) => boolean;
  createOrgUnit: (input: {
    name: string;
    overview: string;
    coreResponsibilities: string;
    primaryDeliverables: string;
    workingModel: 'human' | 'agent' | 'hybrid';
    iconSourceDataUrl: string;
    iconDataUrl: string;
  }) => void;
  createBusinessUnit: (input: {
    name: string;
    overview: string;
    logoSourceDataUrl: string;
    logoDataUrl: string;
  }) => void;
  createActor: (input: {
    name: string;
    title: string;
    kind: 'agent' | 'human';
    targetOrgUnitId: string;
    sourceAgentId?: string | null;
    primaryObjective: string;
    systemDirective: string;
    roleBrief: string;
    avatarSourceDataUrl: string;
    avatarDataUrl: string;
  }) => boolean;
  getSuggestedActorOrgUnitId: () => string | null;
  handleConfirmDelete: () => void;
};

export function useOrgChartSurfaceActions(input: UseOrgChartSurfaceActionsInput): OrgChartSurfaceActions {
  const { execute, selectedNode, setSelectedNode, orgUnits, getOperatorById } = input;
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const executeCommand = (command: OrgCommand): boolean => {
    const result = execute(command);
    if (!result.ok) {
      setErrorMessage(result.message ?? 'Unable to apply org change.');
      return false;
    }
    setErrorMessage('');
    return true;
  };

  const createOrgUnit = (input: {
    name: string;
    overview: string;
    coreResponsibilities: string;
    primaryDeliverables: string;
    workingModel: 'human' | 'agent' | 'hybrid';
    iconSourceDataUrl: string;
    iconDataUrl: string;
  }) => {
    const parentId = selectedNode?.kind === 'org_unit' ? selectedNode.id : null;
    if (parentId) {
      executeCommand({
        kind: 'create_org_unit',
        parentId,
        payload: {
          name: input.name.trim() || 'New Org Unit',
          overview: input.overview,
          coreResponsibilities: input.coreResponsibilities,
          primaryDeliverables: input.primaryDeliverables,
          workingModel: input.workingModel,
          iconSourceDataUrl: input.iconSourceDataUrl,
          iconDataUrl: input.iconDataUrl
        }
      });
      return;
    }

    if (selectedNode?.kind === 'business_unit') {
      executeCommand({
        kind: 'create_org_unit',
        parentId: null,
        payload: {
          name: input.name.trim() || 'New Org Unit',
          overview: input.overview,
          coreResponsibilities: input.coreResponsibilities,
          primaryDeliverables: input.primaryDeliverables,
          workingModel: input.workingModel,
          iconSourceDataUrl: input.iconSourceDataUrl,
          iconDataUrl: input.iconDataUrl,
          rootScope: 'business_unit',
          rootBusinessUnitId: selectedNode.id
        }
      });
      return;
    }

    if (selectedNode?.kind === 'scope_bucket') {
      executeCommand({
        kind: 'create_org_unit',
        parentId: null,
        payload: {
          name: input.name.trim() || 'New Org Unit',
          overview: input.overview,
          coreResponsibilities: input.coreResponsibilities,
          primaryDeliverables: input.primaryDeliverables,
          workingModel: input.workingModel,
          iconSourceDataUrl: input.iconSourceDataUrl,
          iconDataUrl: input.iconDataUrl,
          rootScope: selectedNode.scope
        }
      });
      return;
    }

    executeCommand({
      kind: 'create_org_unit',
      parentId: null,
      payload: {
        name: input.name.trim() || 'New Org Unit',
        overview: input.overview,
        coreResponsibilities: input.coreResponsibilities,
        primaryDeliverables: input.primaryDeliverables,
        workingModel: input.workingModel,
        iconSourceDataUrl: input.iconSourceDataUrl,
        iconDataUrl: input.iconDataUrl,
        rootScope: 'unassigned'
      }
    });
  };

  const createBusinessUnit = (input: {
    name: string;
    overview: string;
    logoSourceDataUrl: string;
    logoDataUrl: string;
  }) => {
    executeCommand({
      kind: 'create_business_unit',
      parentId: null,
      payload: {
        name: input.name.trim() || 'New Business Unit',
        overview: input.overview,
        logoSourceDataUrl: input.logoSourceDataUrl,
        logoDataUrl: input.logoDataUrl
      }
    });
  };

  const getSuggestedActorOrgUnitId = () => {
    const firstOrgUnit = orgUnits[0];
    return (
      selectedNode?.kind === 'org_unit'
        ? selectedNode.id
        : selectedNode?.kind === 'operator'
          ? getOperatorById(selectedNode.id)?.orgUnitId
          : firstOrgUnit?.id
    ) ?? null;
  };

  const createActor = (input: {
    name: string;
    title: string;
    kind: 'agent' | 'human';
    targetOrgUnitId: string;
    sourceAgentId?: string | null;
    primaryObjective: string;
    systemDirective: string;
    roleBrief: string;
    avatarSourceDataUrl: string;
    avatarDataUrl: string;
  }) => {
    if (!input.targetOrgUnitId) {
      setErrorMessage('Create an org unit before adding an operator.');
      return false;
    }

    const targetExists = orgUnits.some((unit) => unit.id === input.targetOrgUnitId);
    if (!targetExists) {
      setErrorMessage('Create an org unit before adding an operator.');
      return false;
    }

    return executeCommand({
      kind: 'create_operator',
      targetOrgUnitId: input.targetOrgUnitId,
      payload: {
        sourceAgentId: input.sourceAgentId ?? null,
        name: input.name.trim() || 'New Operator',
        title: input.title.trim() || 'Role',
        kind: input.kind,
        primaryObjective: input.primaryObjective,
        systemDirective: input.systemDirective,
        roleBrief: input.roleBrief,
        avatarSourceDataUrl: input.avatarSourceDataUrl,
        avatarDataUrl: input.avatarDataUrl
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.kind === 'business_unit') {
      executeCommand({ kind: 'delete_business_unit', nodeId: pendingDelete.id });
    } else if (pendingDelete.kind === 'org_unit') {
      executeCommand({ kind: 'delete_org_unit', nodeId: pendingDelete.id });
    } else if (pendingDelete.kind === 'operator') {
      executeCommand({ kind: 'delete_operator', operatorId: pendingDelete.id });
    }

    setPendingDelete(null);
    setSelectedNode(null);
  };

  return {
    errorMessage,
    setErrorMessage,
    pendingDelete,
    setPendingDelete,
    executeCommand,
    createOrgUnit,
    createBusinessUnit,
    createActor,
    getSuggestedActorOrgUnitId,
    handleConfirmDelete
  };
}
