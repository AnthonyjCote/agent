/**
 * Purpose: Provide a reusable premium dropdown selector control.
 * Responsibilities:
 * - Render controlled value selection with a custom listbox popover.
 * - Expose a consistent option contract across shared forms.
 */
// @tags: shared-ui,controls,dropdown
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './DropdownSelector.css';

export type DropdownOption = {
  value: string;
  label: string;
};

type DropdownSelectorProps = {
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
};

export function DropdownSelector({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false
}: DropdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (rootRef.current.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const toggleOpen = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => !current);
  };

  const handleOptionSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!disabled) {
        setOpen(true);
      }
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="dropdown-selector" ref={rootRef}>
      <button
        type="button"
        className="dropdown-selector-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? ''}</span>
      </button>
      <span className="dropdown-selector-chevron" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="m5 7 5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {open ? (
        <ul className="dropdown-selector-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`dropdown-selector-option${active ? ' active' : ''}`}
                  onClick={() => handleOptionSelect(option.value)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
