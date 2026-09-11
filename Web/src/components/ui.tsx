import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

export function Brand() {
  return (
    <Link className="brand" to="/overview" aria-label="KeepIt overview">
      <span className="brand-mark" aria-hidden="true">
        K
      </span>
      KeepIt<span className="brand-dot">.</span>
    </Link>
  );
}
export function Notice({
  error,
  retry,
}: {
  error: string | null;
  retry?: () => void;
}) {
  return error ? (
    <div className="notice" role="alert">
      <span>{error}</span>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading…
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 tabIndex={-1}>{title}</h1>
      </div>
      {children}
    </header>
  );
}
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <p className="eyebrow">Please confirm</p>
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-description" className="muted">
        {description}
      </p>
      <Notice error={error} />
      <div className="actions">
        <button
          autoFocus
          className="button secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button className="button danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
