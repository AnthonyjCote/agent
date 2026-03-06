import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import type { AgentRuntimeClient } from '@agent-deck/runtime-client';
import { createRuntimeClient } from './createRuntimeClient';

const RuntimeContext = createContext<AgentRuntimeClient | null>(null);

export function RuntimeProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => createRuntimeClient(), []);
  return <RuntimeContext.Provider value={client}>{children}</RuntimeContext.Provider>;
}

export function useRuntimeClient(): AgentRuntimeClient {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error('Runtime client missing. Wrap app with RuntimeProvider.');
  }
  return value;
}
