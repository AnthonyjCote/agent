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

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
  size?: 'default' | 'compact';
};

export function DropdownSelector({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  size = 'default'
}: DropdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = () => {
      if (!rootRef.current) {
        return;
      }
      const rect = rootRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuHeight = size === 'compact' ? 220 : 260;
      const gap = 8;
      const spaceBelow = viewportHeight - rect.bottom;
      const placeAbove = spaceBelow < menuHeight && rect.top > menuHeight;
      const desiredWidth = Math.max(rect.width, 400);
      const maxLeft = Math.max(gap, viewportWidth - desiredWidth - gap);
      const clampedLeft = Math.min(Math.max(gap, rect.left), maxLeft);
      setMenuStyle({
        position: 'fixed',
        left: clampedLeft,
        width: desiredWidth,
        top: placeAbove ? rect.top - gap : rect.bottom + gap,
        transform: placeAbove ? 'translateY(-100%)' : undefined
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, size]);

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
        className={`dropdown-selector-trigger dropdown-selector-trigger-${size}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? ''}</span>
      </button>
      <span className={`dropdown-selector-chevron dropdown-selector-chevron-${size}`} aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="m5 7 5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {open
        ? createPortal(
            <ul
              className={`dropdown-selector-options dropdown-selector-options-${size}`}
              role="listbox"
              aria-label={ariaLabel}
              style={menuStyle}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <li key={option.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      className={`dropdown-selector-option dropdown-selector-option-${size}${active ? ' active' : ''}`}
                      onClick={() => handleOptionSelect(option.value)}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}
