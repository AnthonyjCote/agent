/**
 * Purpose: Persist agent manifests in app-managed local storage for V1 GUI.
 * Responsibilities:
 * - Load and save full manifest list.
 * - Keep storage access isolated from UI components.
 */
// @tags: shared-config,agents,storage
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { AgentManifest } from './agent-manifest';

const STORAGE_KEY = 'agent-deck.agent-manifests';

export function loadAgentManifests(): AgentManifest[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as AgentManifest[];
  } catch {
    return [];
  }
}

export function saveAgentManifests(manifests: AgentManifest[]) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manifests));
}
