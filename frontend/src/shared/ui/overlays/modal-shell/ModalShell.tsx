/**
 * Purpose: Provide a reusable modal shell overlay with size variants.
 * Responsibilities:
 * - Render accessible modal frame for domain/module forms.
 * - Support small/medium/large shell variants for different use cases.
 */
// @tags: shared-ui,modal,overlay
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { useEffect, useRef } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import './ModalShell.css';

export type ModalSize = 'small' | 'medium' | 'large';

type ModalShellProps = PropsWithChildren<{
  open: boolean;
  title?: string;
  size?: ModalSize;
  onClose: () => void;
  footer?: ReactNode;
  ariaLabel?: string;
}>;

export function ModalShell({ open, title, size = 'medium', onClose, footer, children, ariaLabel }: ModalShellProps) {
  const frameRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    frameRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-shell-overlay" role="presentation" onClick={onClose}>
      <section
        ref={frameRef}
        className={`modal-shell-frame size-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || 'Modal'}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? (
          <header className="modal-shell-header">
            <h2>{title}</h2>
          </header>
        ) : null}
        <div className="modal-shell-body">{children}</div>
        {footer ? <footer className="modal-shell-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
