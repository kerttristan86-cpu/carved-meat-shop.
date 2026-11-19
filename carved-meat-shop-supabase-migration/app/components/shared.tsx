"use client";
import { useEffect, useRef } from "react";
import { LoaderCircle, Package } from "lucide-react";
type R = Record<string, any>;
export const date = (d: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
export const number = (d: R, s: R) =>
  `${d.data.shop?.prefix || s.prefix}-${String(d.number).padStart(6, "0")}`;
export function download(name: string, rows: any[][]) {
  const csv = rows
    .map((r) =>
      r.map((c) => '"' + String(c ?? "").replaceAll('"', '""') + '"').join(","),
    )
    .join("\r\n");
  const u = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Package size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function LoadingIndicator({
  label = "Loading",
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  return (
    <span
      className={`loading-indicator${inline ? " inline" : ""}`}
      role="status"
    >
      <LoaderCircle aria-hidden="true" size={inline ? 16 : 24} />
      <span>{label}</span>
    </span>
  );
}
export function LoadingOverlay({
  label = "Saving changes…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <LoadingIndicator label={label} />
    </div>
  );
}
export function LoadingScreen() {
  return (
    <main className="login loading-screen">
      <img src="/carved-logo-transparent.png" alt="CARVED Meat Shop" />
      <LoadingIndicator label="Opening your shop…" />
    </main>
  );
}
export function Modal({
  ariaLabel,
  onClose,
  children,
  busy = false,
  className = "modal",
  backdropClassName = "",
}: {
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
  className?: string;
  backdropClassName?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const current = useRef({ onClose, busy });
  current.current = { onClose, busy };
  useEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex='-1'])",
        ),
      ).filter(
        (el) =>
          (node.contains(el) || el.closest("[data-toast]")) &&
          el.getClientRects().length > 0 &&
          !el.closest("[hidden],[inert]"),
      );
    (focusable()[0] || node).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!current.current.busy) current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        node.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          (!node.contains(document.activeElement) &&
            !(document.activeElement as HTMLElement | null)?.closest(
              "[data-toast]",
            )))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          (!node.contains(document.activeElement) &&
            !(document.activeElement as HTMLElement | null)?.closest(
              "[data-toast]",
            )))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (
        !node.contains(event.target as Node) &&
        !(event.target as HTMLElement)?.closest("[data-toast]")
      )
        (focusable()[0] || node).focus();
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${backdropClassName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={ref}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-busy={busy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
