/**
 * Purpose: Resolve and render the active domain view component.
 * Responsibilities:
 * - Provide a shell-owned mount point for per-view rendering.
 */
// @tags: app,shell,view-router,routing
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import type { ViewDefinition } from '@/app/shell/model/ui-contract';

type ViewRouterProps = {
  viewDefinition: ViewDefinition;
};

export function ViewRouter({ viewDefinition }: ViewRouterProps) {
  const ActiveView = viewDefinition.component;
  return <ActiveView />;
}
