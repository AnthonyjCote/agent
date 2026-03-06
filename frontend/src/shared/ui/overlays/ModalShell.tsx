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

import type { PropsWithChildren, ReactNode } from 'react';
import './ModalShell.css';

export type ModalSize = 'small' | 'medium' | 'large';

type ModalShellProps = PropsWithChildren<{
  open: boolean;
  title: string;
  size?: ModalSize;
  onClose: () => void;
  footer?: ReactNode;
}>;

export function ModalShell({ open, title, size = 'medium', onClose, footer, children }: ModalShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-shell-overlay" role="presentation" onClick={onClose}>
      <section
        className={`modal-shell-frame size-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-shell-header">
          <h2>{title}</h2>
          <button type="button" className="modal-shell-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </header>
        <div className="modal-shell-body">{children}</div>
        {footer ? <footer className="modal-shell-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
