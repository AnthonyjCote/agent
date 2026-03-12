/**
 * Purpose: Compose app-level runtime provider and shell routing state.
 * Responsibilities:
 * - Own top-level view state for shell navigation.
 * - Mount shared runtime provider around shell composition.
 */
// @tags: app,orchestration,shell
// @status: active
// @owner: founder
// @domain: app
// @adr: none

import { useEffect, useState } from 'react';
import { RuntimeProvider } from './runtime/RuntimeProvider';
import { AgentManifestStoreProvider } from '@/shared/config/agents';
import { OrgChartStoreProvider } from '@/shared/config/org-chart';
import { ChatGuiStoreProvider } from '@/domains/chat-gui/model/ChatGuiStoreProvider';
import type { ViewMode } from '@/app/shell/model/ui-contract';
import { VIEW_DEFINITIONS, VIEW_ORDER } from '@/app/shell/view-registry/view-registry';
import { ShellFrame } from '@/app/shell/shell-frame/ShellFrame';
import './app.css';

const VIEW_MODE_STORAGE_KEY = 'agent-deck.view-mode';

function isViewMode(value: string): value is ViewMode {
  return VIEW_ORDER.includes(value as ViewMode);
}

function resolveInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') {
    return 'chat-gui';
  }

  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (stored && isViewMode(stored)) {
    return stored;
  }

  return 'chat-gui';
}

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(resolveInitialViewMode);

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  return (
    <RuntimeProvider>
      <AgentManifestStoreProvider>
        <OrgChartStoreProvider>
          <ChatGuiStoreProvider>
            <ShellFrame
              viewMode={viewMode}
              setViewMode={setViewMode}
              viewDefinition={VIEW_DEFINITIONS[viewMode]}
            />
          </ChatGuiStoreProvider>
        </OrgChartStoreProvider>
      </AgentManifestStoreProvider>
    </RuntimeProvider>
  );
}
