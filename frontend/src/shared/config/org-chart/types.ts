/**
 * Purpose: Define shared contracts for org-chart entities, commands, and history.
 * Responsibilities:
 * - Provide canonical types for org units, actors, links, and mutation commands.
 * - Keep UI and command engine aligned on stable object contracts.
 */
// @tags: shared-config,org-chart,types
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

export type OrgUnitId = string;
export type ActorId = string;
export type BusinessUnitId = string;
export type LinkId = string;

export type ActorKind = 'agent' | 'human';
export type OrgUnitScope = 'business_unit' | 'shared' | 'unassigned';

export type OrgUnit = {
  id: OrgUnitId;
  name: string;
  overview: string;
  coreResponsibilities: string;
  primaryDeliverables: string;
  workingModel: 'human' | 'agent' | 'hybrid';
  parentOrgUnitId: OrgUnitId | null;
  scope: OrgUnitScope;
  businessUnitId: BusinessUnitId | null;
  iconSourceDataUrl: string;
  iconDataUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessUnit = {
  id: BusinessUnitId;
  name: string;
  overview: string;
  objectives: string;
  primaryProductsOrServices: string;
  successMetrics: string;
  parentBusinessUnitId: BusinessUnitId | null;
  logoSourceDataUrl: string;
  logoDataUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Actor = {
  id: ActorId;
  name: string;
  title: string;
  primaryObjective: string;
  systemDirective: string;
  roleBrief: string;
  kind: ActorKind;
  orgUnitId: OrgUnitId;
  managerActorId: ActorId | null;
  avatarSourceDataUrl: string;
  avatarDataUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type LinkRelation =
  | 'business_unit_parent_of_business_unit'
  | 'business_unit_contains_org_unit'
  | 'org_unit_parent_of_org_unit'
  | 'org_unit_contains_actor'
  | 'actor_reports_to_actor';

export type Link = {
  id: LinkId;
  fromType: 'business_unit' | 'org_unit' | 'actor';
  fromId: string;
  toType: 'business_unit' | 'org_unit' | 'actor';
  toId: string;
  relation: LinkRelation;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  entityType: 'business_unit' | 'org_unit' | 'actor' | 'org_chart';
  entityId: string;
  eventType: string;
  actorId: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type OrgSnapshot = {
  businessUnits: BusinessUnit[];
  orgUnits: OrgUnit[];
  actors: Actor[];
  links: Link[];
};

export type OrgCommand =
  | {
      kind: 'create_business_unit';
      parentId: BusinessUnitId | null;
      payload: {
        name: string;
        overview?: string;
        objectives?: string;
        primaryProductsOrServices?: string;
        successMetrics?: string;
        logoSourceDataUrl?: string;
        logoDataUrl?: string;
      };
    }
  | {
      kind: 'move_business_unit';
      nodeId: BusinessUnitId;
      newParentId: BusinessUnitId | null;
      position?: number;
    }
  | {
      kind: 'rename_business_unit';
      nodeId: BusinessUnitId;
      name: string;
    }
  | {
      kind: 'update_business_unit';
      nodeId: BusinessUnitId;
      patch: Partial<
        Pick<BusinessUnit, 'name' | 'overview' | 'objectives' | 'primaryProductsOrServices' | 'successMetrics'>
      >;
    }
  | {
      kind: 'create_org_unit';
      parentId: OrgUnitId | null;
      payload: {
        name: string;
        overview?: string;
        coreResponsibilities?: string;
        primaryDeliverables?: string;
        workingModel?: OrgUnit['workingModel'];
        iconSourceDataUrl?: string;
        iconDataUrl?: string;
        rootScope?: OrgUnitScope;
        rootBusinessUnitId?: BusinessUnitId | null;
      };
    }
  | {
      kind: 'assign_org_unit_business_unit';
      orgUnitId: OrgUnitId;
      businessUnitId: BusinessUnitId | null;
    }
  | {
      kind: 'set_org_unit_scope';
      orgUnitId: OrgUnitId;
      scope: OrgUnitScope;
      businessUnitId?: BusinessUnitId | null;
    }
  | {
      kind: 'create_actor';
      targetOrgUnitId: OrgUnitId;
      payload: {
        name: string;
        title: string;
        kind: ActorKind;
        primaryObjective?: string;
        systemDirective?: string;
        roleBrief?: string;
        avatarSourceDataUrl?: string;
        avatarDataUrl?: string;
      };
    }
  | {
      kind: 'move_org_unit';
      nodeId: OrgUnitId;
      newParentId: OrgUnitId | null;
      position?: number;
    }
  | {
      kind: 'move_actor';
      actorId: ActorId;
      targetOrgUnitId: OrgUnitId;
      position?: number;
    }
  | {
      kind: 'set_actor_manager';
      actorId: ActorId;
      managerActorId: ActorId | null;
    }
  | {
      kind: 'rename_org_unit';
      nodeId: OrgUnitId;
      name: string;
    }
  | {
      kind: 'update_org_unit';
      nodeId: OrgUnitId;
      patch: Partial<
        Pick<OrgUnit, 'name' | 'overview' | 'coreResponsibilities' | 'primaryDeliverables' | 'workingModel'>
      >;
    }
  | {
      kind: 'update_actor';
      actorId: ActorId;
      patch: Partial<
        Pick<Actor, 'name' | 'title' | 'kind' | 'primaryObjective' | 'systemDirective' | 'roleBrief'>
      >;
    }
  | {
      kind: 'delete_business_unit';
      nodeId: BusinessUnitId;
    }
  | {
      kind: 'delete_org_unit';
      nodeId: OrgUnitId;
    }
  | {
      kind: 'delete_actor';
      actorId: ActorId;
    }
  | {
      kind: 'set_business_unit_logo';
      nodeId: BusinessUnitId;
      sourceDataUrl: string;
      croppedDataUrl: string;
    }
  | {
      kind: 'set_org_unit_icon';
      nodeId: OrgUnitId;
      sourceDataUrl: string;
      croppedDataUrl: string;
    }
  | {
      kind: 'set_actor_avatar';
      actorId: ActorId;
      sourceDataUrl: string;
      croppedDataUrl: string;
    };

export type OrgChangeCommand = {
  id: string;
  command: OrgCommand;
  actorId: string;
  executedAt: string;
  before: OrgSnapshot;
  after: OrgSnapshot;
};

export type OrgChartData = {
  snapshot: OrgSnapshot;
  activityEvents: ActivityEvent[];
  commandHistory: OrgChangeCommand[];
  historyCursor: number;
};

export type OrgValidationErrorCode =
  | 'business_unit_not_found'
  | 'org_unit_not_found'
  | 'actor_not_found'
  | 'invalid_move'
  | 'business_unit_cycle_detected'
  | 'org_cycle_detected'
  | 'actor_cycle_detected'
  | 'validation_error';

export class OrgValidationError extends Error {
  readonly code: OrgValidationErrorCode;

  constructor(code: OrgValidationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
