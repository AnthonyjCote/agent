/**
 * Purpose: Persist org-chart state and command history in app-managed storage.
 * Responsibilities:
 * - Load org-chart data from local storage for V1 runtime.
 * - Save org-chart data after command mutations.
 */
// @tags: shared-config,org-chart,storage
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { createInitialOrgChartData } from './seed';
import type { OrgChartData } from './types';

const STORAGE_KEY = 'agent-deck.org-chart.v1';
const STORAGE_KEY_COMPACT = 'agent-deck.org-chart.v1.compact';

type StoredOrgChart = OrgChartData & {
  snapshot?: {
    businessUnits?: unknown;
    orgUnits?: Array<Record<string, unknown>>;
    operators?: unknown;
    links?: unknown;
  };
  activityEvents?: unknown;
  commandHistory?: unknown;
  historyCursor?: unknown;
};

function normalizeStoredData(parsed: StoredOrgChart): OrgChartData {
  if (!parsed?.snapshot) {
    return createInitialOrgChartData();
  }

  const normalized = parsed as OrgChartData;
  normalized.snapshot.businessUnits = Array.isArray(parsed.snapshot.businessUnits)
    ? (parsed.snapshot.businessUnits as OrgChartData['snapshot']['businessUnits']).map((businessUnit) => ({
        ...businessUnit,
        overview: typeof businessUnit.overview === 'string' ? businessUnit.overview : '',
        objectives: typeof businessUnit.objectives === 'string' ? businessUnit.objectives : '',
        primaryProductsOrServices:
          typeof businessUnit.primaryProductsOrServices === 'string' ? businessUnit.primaryProductsOrServices : '',
        successMetrics: typeof businessUnit.successMetrics === 'string' ? businessUnit.successMetrics : '',
        logoSourceDataUrl: typeof businessUnit.logoSourceDataUrl === 'string' ? businessUnit.logoSourceDataUrl : '',
        logoDataUrl: typeof businessUnit.logoDataUrl === 'string' ? businessUnit.logoDataUrl : '',
        parentBusinessUnitId:
          typeof businessUnit.parentBusinessUnitId === 'string' || businessUnit.parentBusinessUnitId === null
            ? businessUnit.parentBusinessUnitId
            : null
      }))
    : [];

  normalized.snapshot.orgUnits = Array.isArray(parsed.snapshot.orgUnits)
    ? parsed.snapshot.orgUnits.map((orgUnit) => ({
        ...(orgUnit as OrgChartData['snapshot']['orgUnits'][number]),
        overview: typeof orgUnit.overview === 'string' ? orgUnit.overview : '',
        coreResponsibilities: typeof orgUnit.coreResponsibilities === 'string' ? orgUnit.coreResponsibilities : '',
        primaryDeliverables: typeof orgUnit.primaryDeliverables === 'string' ? orgUnit.primaryDeliverables : '',
        workingModel:
          orgUnit.workingModel === 'human' || orgUnit.workingModel === 'agent' || orgUnit.workingModel === 'hybrid'
            ? orgUnit.workingModel
            : 'hybrid',
        iconSourceDataUrl: typeof orgUnit.iconSourceDataUrl === 'string' ? orgUnit.iconSourceDataUrl : '',
        iconDataUrl: typeof orgUnit.iconDataUrl === 'string' ? orgUnit.iconDataUrl : '',
        scope:
          orgUnit.scope === 'business_unit' || orgUnit.scope === 'shared' || orgUnit.scope === 'unassigned'
            ? orgUnit.scope
            : typeof orgUnit.businessUnitId === 'string'
              ? 'business_unit'
              : 'unassigned',
        businessUnitId:
          typeof orgUnit.businessUnitId === 'string' || orgUnit.businessUnitId === null
            ? (orgUnit.businessUnitId as string | null)
            : null
      }))
    : [];

  normalized.snapshot.operators = Array.isArray(parsed.snapshot.operators)
    ? (parsed.snapshot.operators as OrgChartData['snapshot']['operators']).map((operator) => ({
        ...operator,
        sourceAgentId:
          typeof operator.sourceAgentId === 'string' || operator.sourceAgentId === null
            ? operator.sourceAgentId
            : null,
        primaryObjective: typeof operator.primaryObjective === 'string' ? operator.primaryObjective : '',
        systemDirective: typeof operator.systemDirective === 'string' ? operator.systemDirective : '',
        roleBrief: typeof operator.roleBrief === 'string' ? operator.roleBrief : '',
        avatarSourceDataUrl: typeof operator.avatarSourceDataUrl === 'string' ? operator.avatarSourceDataUrl : '',
        avatarDataUrl: typeof operator.avatarDataUrl === 'string' ? operator.avatarDataUrl : ''
      }))
    : [];

  normalized.snapshot.links = Array.isArray(parsed.snapshot.links)
    ? (parsed.snapshot.links as OrgChartData['snapshot']['links'])
    : [];

  normalized.activityEvents = Array.isArray(parsed.activityEvents)
    ? (parsed.activityEvents as OrgChartData['activityEvents'])
    : [];
  normalized.commandHistory = Array.isArray(parsed.commandHistory)
    ? (parsed.commandHistory as OrgChartData['commandHistory'])
    : [];
  normalized.historyCursor = typeof parsed.historyCursor === 'number' ? parsed.historyCursor : -1;

  const businessUnitIds = new Set(normalized.snapshot.businessUnits.map((unit) => unit.id));
  normalized.snapshot.businessUnits = normalized.snapshot.businessUnits.map((unit) => ({
    ...unit,
    parentBusinessUnitId:
      unit.parentBusinessUnitId && businessUnitIds.has(unit.parentBusinessUnitId) ? unit.parentBusinessUnitId : null
  }));
  normalized.snapshot.orgUnits = normalized.snapshot.orgUnits.map((orgUnit) => ({
    ...orgUnit,
    scope:
      orgUnit.scope === 'business_unit' && (!orgUnit.businessUnitId || !businessUnitIds.has(orgUnit.businessUnitId))
        ? 'unassigned'
        : orgUnit.scope,
    businessUnitId:
      orgUnit.scope === 'business_unit' && orgUnit.businessUnitId && businessUnitIds.has(orgUnit.businessUnitId)
        ? orgUnit.businessUnitId
        : null
  }));

  return normalized;
}

export function loadOrgChartData(): OrgChartData {
  if (typeof window === 'undefined') {
    return createInitialOrgChartData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return normalizeStoredData(JSON.parse(raw) as StoredOrgChart);
    } catch {
      // Fall through to compact payload.
    }
  }

  const compactRaw = window.localStorage.getItem(STORAGE_KEY_COMPACT);
  if (compactRaw) {
    try {
      return normalizeStoredData(JSON.parse(compactRaw) as StoredOrgChart);
    } catch {
      return createInitialOrgChartData();
    }
  }

  return createInitialOrgChartData();
}

export function saveOrgChartData(data: OrgChartData) {
  if (typeof window === 'undefined') {
    return;
  }

  const compactData: OrgChartData = {
    snapshot: data.snapshot,
    activityEvents: [],
    commandHistory: [],
    historyCursor: -1
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.localStorage.setItem(STORAGE_KEY_COMPACT, JSON.stringify(compactData));
    return;
  } catch {}

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compactData));
    window.localStorage.setItem(STORAGE_KEY_COMPACT, JSON.stringify(compactData));
    return;
  } catch {}

  try {
    window.localStorage.setItem(STORAGE_KEY_COMPACT, JSON.stringify(compactData));
  } catch {
    console.warn('Unable to persist org chart data: local storage quota exceeded.');
  }
}
