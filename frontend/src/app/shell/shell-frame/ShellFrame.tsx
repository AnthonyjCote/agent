/**
 * Purpose: Compose global rail and active view region for the application shell.
 * Responsibilities:
 * - Render left global rail navigation.
 * - Render full-bleed working area for the active domain view.
 */
// @tags: app,shell,layout
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import type { ViewDefinition, ViewMode } from '@/app/shell/model/ui-contract';
import { GlobalRail } from '@/app/shell/global-rail/GlobalRail';
import { ViewRouter } from '@/app/shell/view-router/ViewRouter';
import './ShellFrame.css';

type ShellFrameProps = {
  viewMode: ViewMode;
  setViewMode: (next: ViewMode) => void;
  viewDefinition: ViewDefinition;
};

export function ShellFrame({ viewMode, setViewMode, viewDefinition }: ShellFrameProps) {
  return (
    <div className="shell-root">
      <GlobalRail viewMode={viewMode} setViewMode={setViewMode} />
      <div className="shell-main">
        <main className="view-region" aria-label="Main content">
          <ViewRouter viewDefinition={viewDefinition} />
        </main>
      </div>
    </div>
  );
}
