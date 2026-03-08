import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useRuntimeClient } from '../../../app/runtime/RuntimeProvider';
import { useChatGuiState } from './useChatGuiState';

type ChatGuiStoreValue = ReturnType<typeof useChatGuiState>;

const ChatGuiStoreContext = createContext<ChatGuiStoreValue | null>(null);

export function ChatGuiStoreProvider({ children }: PropsWithChildren) {
  const runtimeClient = useRuntimeClient();
  const value = useChatGuiState(runtimeClient);
  const memoizedValue = useMemo(() => value, [value]);
  return <ChatGuiStoreContext.Provider value={memoizedValue}>{children}</ChatGuiStoreContext.Provider>;
}

export function useChatGuiStore(): ChatGuiStoreValue {
  const value = useContext(ChatGuiStoreContext);
  if (!value) {
    throw new Error('Chat GUI store missing. Wrap app with ChatGuiStoreProvider.');
  }
  return value;
}

