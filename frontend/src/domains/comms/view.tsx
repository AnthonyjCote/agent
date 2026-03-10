import { useEffect, useMemo, useState } from 'react';
import type { CommsChannel } from '@agent-deck/runtime-client';
import { CommsChatSurface, CommsEmailSurface, CommsSmsSurface, CommsTopRailSurface } from './surface';
import { CommsAccountSelectorModal } from './surface/top-rail/account-selector-modal';
import { useAgentManifestStore, useOrgChartStore } from '../../shared/config';
import './view.css';

const COMMS_ACTIVE_OPERATOR_STORAGE_KEY = 'agent-deck.comms.active-operator-id';

function getStoredCommsActiveOperatorId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = window.localStorage.getItem(COMMS_ACTIVE_OPERATOR_STORAGE_KEY);
  return value && value.trim().length > 0 ? value : null;
}

function normalizeLocalPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'operator'
  );
}

function normalizeDomainPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.+/g, '.') || 'local.agentdeck'
  );
}

function buildOperatorEmailAddress(operatorName: string, businessUnitName: string): string {
  const [first, ...rest] = operatorName.trim().split(/\s+/);
  const last = rest.join(' ');
  const local = normalizeLocalPart(`${first || ''}.${last || ''}`);
  const domain = normalizeDomainPart(businessUnitName);
  return `${local}@${domain}`;
}

export function CommsView() {
  const [channel, setChannel] = useState<CommsChannel>('email');
  const newThreadNonce = 0;
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [activeOperatorId, setActiveOperatorId] = useState<string | null>(() => getStoredCommsActiveOperatorId());
  const { operators, orgUnits, businessUnits } = useOrgChartStore();
  const { agents } = useAgentManifestStore();

  const manifestById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const displayOperators = useMemo(
    () =>
      operators.map((operator) => {
        if (!operator.sourceAgentId) {
          return operator;
        }
        const manifest = manifestById.get(operator.sourceAgentId);
        if (!manifest) {
          return operator;
        }
        return {
          ...operator,
          name: manifest.name,
          title: manifest.role,
          avatarDataUrl: manifest.avatarDataUrl,
          avatarSourceDataUrl: manifest.avatarSourceDataUrl
        };
      }),
    [operators, manifestById]
  );

  useEffect(() => {
    if (displayOperators.length === 0) {
      setActiveOperatorId(null);
      return;
    }
    if (!activeOperatorId || !displayOperators.some((operator) => operator.id === activeOperatorId)) {
      setActiveOperatorId(displayOperators[0].id);
    }
  }, [activeOperatorId, displayOperators]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!activeOperatorId) {
      window.localStorage.removeItem(COMMS_ACTIVE_OPERATOR_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(COMMS_ACTIVE_OPERATOR_STORAGE_KEY, activeOperatorId);
  }, [activeOperatorId]);

  const activeOperator = useMemo(
    () => displayOperators.find((operator) => operator.id === activeOperatorId) ?? null,
    [activeOperatorId, displayOperators]
  );

  const orgUnitById = useMemo(() => new Map(orgUnits.map((orgUnit) => [orgUnit.id, orgUnit])), [orgUnits]);
  const businessUnitById = useMemo(
    () => new Map(businessUnits.map((businessUnit) => [businessUnit.id, businessUnit])),
    [businessUnits]
  );

  const resolveOperatorBusinessUnitName = (operatorOrgUnitId: string): string => {
    let cursor = orgUnitById.get(operatorOrgUnitId) ?? null;
    while (cursor) {
      if (cursor.businessUnitId) {
        return businessUnitById.get(cursor.businessUnitId)?.name || 'local.agentdeck';
      }
      cursor = cursor.parentOrgUnitId ? orgUnitById.get(cursor.parentOrgUnitId) ?? null : null;
    }
    return 'local.agentdeck';
  };

  const emailContacts = useMemo(
    () =>
      displayOperators.map((operator) => {
        const businessUnitName = resolveOperatorBusinessUnitName(operator.orgUnitId);
        return {
          id: operator.id,
          name: operator.name,
          title: operator.title,
          address: buildOperatorEmailAddress(operator.name, businessUnitName),
          avatarDataUrl: operator.avatarDataUrl
        };
      }),
    [displayOperators, businessUnitById, orgUnitById]
  );

  const chatContacts = useMemo(
    () =>
      displayOperators.map((operator) => ({
        id: operator.id,
        name: operator.name,
        title: operator.title,
        address: `${normalizeLocalPart(operator.name)}.chat@local.agentdeck`,
        avatarDataUrl: operator.avatarDataUrl
      })),
    [displayOperators]
  );

  const activeOperatorEmailAddress = useMemo(() => {
    if (!activeOperator) {
      return 'operator@local.agentdeck';
    }
    const businessUnitName = resolveOperatorBusinessUnitName(activeOperator.orgUnitId);
    return buildOperatorEmailAddress(activeOperator.name, businessUnitName);
  }, [activeOperator, businessUnitById, orgUnitById]);

  return (
    <section className="comms-view">
      <CommsTopRailSurface
        channel={channel}
        onChannelChange={setChannel}
        activeOperator={activeOperator}
        onOpenAccountSelector={() => setSelectorOpen(true)}
      />
      <div className="comms-view-channel-host">
        {channel === 'email' ? (
          <CommsEmailSurface
            createRequestNonce={newThreadNonce}
            activeOperatorId={activeOperator?.id ?? null}
            activeOperatorName={activeOperator?.name ?? 'Operator'}
            activeOperatorEmailAddress={activeOperatorEmailAddress}
            contacts={emailContacts}
          />
        ) : null}
        {channel === 'chat' ? (
          <CommsChatSurface
            createRequestNonce={newThreadNonce}
            activeOperatorId={activeOperator?.id ?? null}
            activeOperatorName={activeOperator?.name ?? 'Operator'}
            activeOperatorEmailAddress={activeOperatorEmailAddress}
            contacts={chatContacts}
          />
        ) : null}
        {channel === 'sms' ? (
          <CommsSmsSurface
            createRequestNonce={newThreadNonce}
            activeOperatorId={activeOperator?.id ?? null}
            activeOperatorName={activeOperator?.name ?? 'Operator'}
            activeOperatorEmailAddress={activeOperatorEmailAddress}
            contacts={displayOperators.map((operator) => ({
              id: operator.id,
              name: operator.name,
              title: operator.title,
              avatarDataUrl: operator.avatarDataUrl
            }))}
          />
        ) : null}
      </div>
      <CommsAccountSelectorModal
        open={selectorOpen}
        operators={displayOperators.map((operator) => ({
          id: operator.id,
          name: operator.name,
          title: operator.title,
          avatarDataUrl: operator.avatarDataUrl
        }))}
        selectedOperatorId={activeOperatorId}
        onClose={() => setSelectorOpen(false)}
        onSelect={setActiveOperatorId}
      />
    </section>
  );
}
