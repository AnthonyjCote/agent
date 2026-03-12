/**
 * Purpose: Provide reusable small confirmation dialog modal.
 * Responsibilities:
 * - Present warning/confirm copy in a compact shared dialog shell.
 * - Expose consistent cancel/confirm actions for destructive flows.
 */
// @tags: shared-ui,overlays,confirm,dialog
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import { TextButton } from '@/shared/ui/controls';
import { ModalShell } from '@/shared/ui/overlays/modal-shell/ModalShell';
import './ConfirmDialogModal.css';

type ConfirmDialogModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialogModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  onCancel,
  onConfirm
}: ConfirmDialogModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      size="small"
      title={title}
      footer={
        <>
          <TextButton label={cancelLabel} variant="ghost" onClick={onCancel} />
          <TextButton label={confirmLabel} variant={confirmVariant} onClick={onConfirm} />
        </>
      }
    >
      <p className="confirm-dialog-message">{message}</p>
    </ModalShell>
  );
}
