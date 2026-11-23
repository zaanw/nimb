import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Brand({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <span className="brand">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M7 25V8.5M7 17c0-6 3-9 8-9s8 3 8 8v9"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle cx="27.5" cy="5" r="2" fill="currentColor" />
      </svg>
      {!markOnly && (
        <span>
          nimb<span className="brand-period">.</span>
        </span>
      )}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function LoadingRows({
  label,
  count = 4,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="loading-rows" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} aria-hidden="true" />
      ))}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  className = "",
  showTitle = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  showTitle?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.focus();
    function key(e: KeyboardEvent) {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== node) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const focusable = Array.from(
          node?.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ) ?? [],
        ).filter(
          (element) =>
            element.getClientRects().length > 0 && !element.closest("[inert]"),
        );
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === node)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === node)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        className={"modal confirm-dialog " + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {showTitle && <h2>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
type Confirmation = {
  title: string;
  description: string;
  label?: string;
  danger?: boolean;
};
export function useConfirmation() {
  const [value, setValue] = useState<Confirmation | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const finish = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setValue(null);
  }, []);
  const ask = useCallback(
    (next: Confirmation) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setValue(next);
      }),
    [],
  );
  useEffect(
    () => () => {
      resolver.current?.(false);
    },
    [],
  );
  return {
    ask,
    dialog: value ? (
      <Dialog title={value.title} onClose={() => finish(false)}>
        <p>{value.description}</p>
        <div className="dialog-actions">
          <button className="outline" onClick={() => finish(false)}>
            Отмена
          </button>
          <button
            className={"primary " + (value.danger ? "danger-button" : "")}
            onClick={() => finish(true)}
          >
            {value.label || "Подтвердить"}
          </button>
        </div>
      </Dialog>
    ) : null,
  };
}
