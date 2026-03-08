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
export const AGENT_MANIFESTS_CHANGED_EVENT = 'agent-deck:agent-manifests-changed';

function emitAgentManifestsChanged() {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AGENT_MANIFESTS_CHANGED_EVENT));
}

export function loadAgentManifests(): AgentManifest[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        schemaVersion: '1.0',
        agentId: typeof record.agentId === 'string' ? record.agentId : `agt_${Math.random().toString(36).slice(2, 10)}`,
        avatarSourceDataUrl: typeof record.avatarSourceDataUrl === 'string' ? record.avatarSourceDataUrl : '',
        avatarDataUrl: typeof record.avatarDataUrl === 'string' ? record.avatarDataUrl : '',
        name: typeof record.name === 'string' ? record.name : '',
        role: typeof record.role === 'string' ? record.role : '',
        primaryObjective: typeof record.primaryObjective === 'string' ? record.primaryObjective : '',
        systemDirectiveShort: typeof record.systemDirectiveShort === 'string' ? record.systemDirectiveShort : '',
        toolsPolicyRef: typeof record.toolsPolicyRef === 'string' ? record.toolsPolicyRef : 'policy_default',
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
      };
    });
  } catch {
    return [];
  }
}

export function saveAgentManifests(manifests: AgentManifest[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const tryWrite = (next: AgentManifest[]): boolean => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  };

  if (tryWrite(manifests)) {
    emitAgentManifestsChanged();
    return;
  }

  // Fallback 1: keep cropped avatar, drop original source image payload.
  const withoutSource = manifests.map((agent) => ({
    ...agent,
    avatarSourceDataUrl: ''
  }));

  if (tryWrite(withoutSource)) {
    emitAgentManifestsChanged();
    return;
  }

  // Fallback 2: drop avatars as last resort to preserve non-media manifest data.
  const withoutAvatars = manifests.map((agent) => ({
    ...agent,
    avatarSourceDataUrl: '',
    avatarDataUrl: ''
  }));

  if (tryWrite(withoutAvatars)) {
    emitAgentManifestsChanged();
    return;
  }

  {
    console.warn('Unable to persist agent manifests: local storage quota exceeded.');
  }
}
