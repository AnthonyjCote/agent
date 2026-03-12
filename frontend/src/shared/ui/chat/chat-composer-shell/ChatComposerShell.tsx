/**
 * Purpose: Provide a reusable chat composer shell with input and submit action.
 * Responsibilities:
 * - Render a shared chat input treatment for prompt-based interactions.
 * - Normalize submit behavior for Enter/shift-enter usage.
 */
// @tags: shared-ui,chat,composer
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import type { FormEvent, KeyboardEvent } from 'react';
import './ChatComposerShell.css';

type ChatComposerShellProps = {
  value: string;
  onValueChange: (next: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isRunning?: boolean;
  placeholder: string;
};

export function ChatComposerShell({
  value,
  onValueChange,
  onSubmit,
  onStop,
  isRunning = false,
  placeholder
}: ChatComposerShellProps) {
  const trimmed = value.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRunning) {
      onStop?.();
      return;
    }
    if (!trimmed) {
      return;
    }
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (isRunning) {
        onStop?.();
        return;
      }
      if (!trimmed) {
        return;
      }
      onSubmit();
    }
  };

  return (
    <form className="chat-composer-shell" onSubmit={handleSubmit}>
      <textarea
        className="chat-composer-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button
        className={`chat-composer-send${isRunning ? ' is-stop' : ''}`}
        type="submit"
        disabled={isRunning ? false : !trimmed}
      >
        {isRunning ? 'Stop' : 'Send'}
      </button>
    </form>
  );
}
