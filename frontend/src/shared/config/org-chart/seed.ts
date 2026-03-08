/**
 * Purpose: Provide deterministic initial org-chart dataset for first-run bootstrapping.
 * Responsibilities:
 * - Seed root organization node when persisted data is absent.
 * - Initialize empty history and activity collections.
 */
// @tags: shared-config,org-chart,seed
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { OrgChartData } from './types';

function nowIso() {
  return new Date().toISOString();
}

export function createInitialOrgChartData(): OrgChartData {
  const timestamp = nowIso();
  const rootBusinessUnitId = 'bu_root';
  const rootId = 'org_root';

  return {
    snapshot: {
      businessUnits: [
        {
          id: rootBusinessUnitId,
          name: 'Enterprise',
          parentBusinessUnitId: null,
          logoSourceDataUrl: '',
          logoDataUrl: '',
          sortOrder: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      orgUnits: [
        {
          id: rootId,
          name: 'Company',
          parentOrgUnitId: null,
          scope: 'business_unit',
          businessUnitId: rootBusinessUnitId,
          iconSourceDataUrl: '',
          iconDataUrl: '',
          sortOrder: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      actors: [],
      links: []
    },
    activityEvents: [
      {
        id: 'evt_seed_org_chart',
        entityType: 'org_chart',
        entityId: 'org_chart_v1',
        eventType: 'seed_initialized',
        actorId: 'system',
        timestamp,
        data: { rootBusinessUnitId, rootOrgUnitId: rootId }
      }
    ],
    commandHistory: [],
    historyCursor: -1
  };
}
