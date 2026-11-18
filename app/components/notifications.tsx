"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
type Notice = {
  id: string;
  message: string;
  tone: "error" | "success" | "info";
  dismiss?: () => void;
  action?: () => React.ReactNode;
  persistent?: boolean;
};
const Context = createContext<{
  add: (notice: Notice) => void;
  remove: (id: string) => void;
} | null>(null);
function Notification({
  notice,
  remove,
}: {
  notice: Notice;
  remove: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const close = useCallback(() => {
    remove(notice.id);
    notice.dismiss?.();
  }, [notice, remove]);
  useEffect(() => {
    if (paused || notice.tone === "error" || notice.persistent) return;
    const timer = window.setTimeout(close, 7000);
    return () => window.clearTimeout(timer);
  }, [notice, paused, close]);
  const Icon =
    notice.tone === "error"
      ? AlertCircle
      : notice.tone === "success"
        ? CheckCircle2
        : Info;
  return (
    <div
      data-toast
      className={`toast toast-${notice.tone}`}
      role={notice.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <Icon size={22} aria-hidden="true" />
      <div className="toast-content">
        <p>{notice.message}</p>
        {notice.action?.()}
      </div>
      {notice.dismiss && (
        <button
          type="button"
          aria-label={
            notice.tone === "error" ? "Dismiss error" : "Dismiss notification"
          }
          onClick={close}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const add = useCallback(
    (notice: Notice) =>
      setNotices((list) => [...list.filter((n) => n.id !== notice.id), notice]),
    [],
  );
  const remove = useCallback(
    (id: string) => setNotices((list) => list.filter((n) => n.id !== id)),
    [],
  );
  const value = useMemo(() => ({ add, remove }), [add, remove]);
  return (
    <Context.Provider value={value}>
      {children}
      <div className="toast-stack" aria-label="Notifications">
        {notices.map((notice) => (
          <Notification key={notice.id} notice={notice} remove={remove} />
        ))}
      </div>
    </Context.Provider>
  );
}
export function Toast({
  message,
  tone = "info",
  onDismiss,
  action,
  persistent = false,
}: {
  message: string;
  tone?: Notice["tone"];
  onDismiss?: () => void;
  action?: React.ReactNode;
  persistent?: boolean;
}) {
  const id = useId();
  const context = useContext(Context);
  const current = useRef({ onDismiss, action });
  current.current = { onDismiss, action };
  const dismissible = Boolean(onDismiss);
  useEffect(() => {
    if (!message || !context) return;
    context.add({
      id,
      message,
      tone,
      persistent,
      dismiss: dismissible ? () => current.current.onDismiss?.() : undefined,
      action: () => current.current.action,
    });
    return () => context.remove(id);
  }, [context, id, message, tone, persistent, dismissible]);
  return null;
}
