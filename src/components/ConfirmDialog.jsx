import React from 'react';

/**
 * Diálogo de confirmação acessível (substitui window.confirm onde o nativo é bloqueado).
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={onCancel}
    >
      <div
        className="modal-content confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-message" className="modal-sub">
          {message}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
