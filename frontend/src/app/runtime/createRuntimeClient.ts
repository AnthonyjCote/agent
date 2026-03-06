import {
  createAgentRuntimeClient,
  type AgentRuntimeClient,
  type RuntimeTarget
} from '@agent-deck/runtime-client';

function inferRuntimeTarget(): RuntimeTarget {
  const explicitTarget = import.meta.env.VITE_RUNTIME_TARGET as RuntimeTarget | undefined;
  if (explicitTarget === 'desktop' || explicitTarget === 'server') {
    return explicitTarget;
  }

  if (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)
  ) {
    return 'desktop';
  }

  return 'server';
}

export function createRuntimeClient(): AgentRuntimeClient {
  const target = inferRuntimeTarget();
  return createAgentRuntimeClient({
    target,
    serverBaseUrl: import.meta.env.VITE_SERVER_BASE_URL
  });
}
