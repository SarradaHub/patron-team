import React, { useEffect, useRef } from 'react';

const stack = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusable(root) {
  return [...root.querySelectorAll(FOCUSABLE)];
}

export default function ModalFrame({
  onClose,
  closeOnBackdrop = true,
  role = 'dialog',
  labelledBy,
  describedBy,
  children,
}) {
  const previouslyFocused = useRef(document.activeElement);
  const frameRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const entry = { close: () => onCloseRef.current() };
    stack.push(entry);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event) => {
      if (stack[stack.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        entry.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = frameRef.current;
      if (!root) return;
      const items = focusable(root);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      document.body.style.overflow = previousOverflow;
      const previous = previouslyFocused.current;
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="modal-backdrop"
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy || undefined}
      aria-describedby={describedBy || undefined}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        if (closeOnBackdrop) onCloseRef.current();
      }}
    >
      {children}
    </div>
  );
}
