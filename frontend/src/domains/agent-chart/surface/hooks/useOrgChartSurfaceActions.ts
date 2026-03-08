import { useState, type Dispatch, type SetStateAction } from 'react';
import type { OrgCommand } from '../../../../shared/config';
import type { PendingDelete, SelectedNode } from '../types';

type UseOrgChartSurfaceActionsInput = {
  execute: (command: OrgCommand) => { ok: boolean; message?: string };
  selectedNode: SelectedNode;
  setSelectedNode: Dispatch<SetStateAction<SelectedNode>>;
  orgUnits: Array<{ id: string }>;
  getActorById: (id: string) => { orgUnitId: string } | undefined;
};

type OrgChartSurfaceActions = {
  errorMessage: string;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  pendingDelete: PendingDelete;
  setPendingDelete: Dispatch<SetStateAction<PendingDelete>>;
  executeCommand: (command: OrgCommand) => boolean;
  addOrgUnit: () => void;
  addBusinessUnit: () => void;
  addActor: () => void;
  handleConfirmDelete: () => void;
};

export function useOrgChartSurfaceActions(input: UseOrgChartSurfaceActionsInput): OrgChartSurfaceActions {
  const { execute, selectedNode, setSelectedNode, orgUnits, getActorById } = input;
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

  const addOrgUnit = () => {
    const parentId = selectedNode?.kind === 'org_unit' ? selectedNode.id : null;
    if (parentId) {
      executeCommand({ kind: 'create_org_unit', parentId, payload: { name: 'New Org Unit' } });
      return;
    }

    if (selectedNode?.kind === 'business_unit') {
      executeCommand({
        kind: 'create_org_unit',
        parentId: null,
        payload: { name: 'New Org Unit', rootScope: 'business_unit', rootBusinessUnitId: selectedNode.id }
      });
      return;
    }

    if (selectedNode?.kind === 'scope_bucket') {
      executeCommand({
        kind: 'create_org_unit',
        parentId: null,
        payload: { name: 'New Org Unit', rootScope: selectedNode.scope }
      });
      return;
    }

    executeCommand({ kind: 'create_org_unit', parentId: null, payload: { name: 'New Org Unit', rootScope: 'unassigned' } });
  };

  const addBusinessUnit = () => {
    executeCommand({ kind: 'create_business_unit', parentId: null, payload: { name: 'New Business Unit' } });
  };

  const addActor = () => {
    const firstOrgUnit = orgUnits[0];
    const targetOrgUnitId =
      selectedNode?.kind === 'org_unit'
        ? selectedNode.id
        : selectedNode?.kind === 'actor'
          ? getActorById(selectedNode.id)?.orgUnitId
          : firstOrgUnit?.id;

    if (!targetOrgUnitId) {
      setErrorMessage('Create an org unit before adding an actor.');
      return;
    }

    executeCommand({
      kind: 'create_actor',
      targetOrgUnitId,
      payload: { name: 'New Actor', title: 'Role', kind: 'agent' }
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
    } else if (pendingDelete.kind === 'actor') {
      executeCommand({ kind: 'delete_actor', actorId: pendingDelete.id });
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
    addOrgUnit,
    addBusinessUnit,
    addActor,
    handleConfirmDelete
  };
}
