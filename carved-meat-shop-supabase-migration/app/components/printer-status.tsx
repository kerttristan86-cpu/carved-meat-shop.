"use client";
import { useEffect, useState } from "react";
import {
  printerConnectionStatus,
  type PrinterConnection,
} from "../../lib/thermal-printer";
export function usePrinterConnection() {
  const [connection, setConnection] = useState<PrinterConnection>({
    state: "unknown",
    name: "",
  });
  useEffect(() => {
    const update = () => {
      const next = printerConnectionStatus();
      setConnection((old) =>
        old.state === next.state && old.name === next.name ? old : next,
      );
    };
    update();
    const timer = window.setInterval(update, 500);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return connection;
}
export function PrinterStatus({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const connection = usePrinterConnection();
  const label =
    connection.state === "connected"
      ? `Printer connected: ${connection.name}`
      : connection.state === "selected"
        ? "Printer selected - connection unverified"
        : connection.state === "unsupported"
          ? "Printer: use system print"
          : connection.state === "unknown"
            ? "Checking printer..."
            : "Printer not connected";
  return (
    <button
      type="button"
      className={`connection printer-status ${connection.state === "connected" ? "" : "offline"}`}
      aria-label={label}
      title={
        connection.state === "selected"
          ? "A desktop port is selected. Its connection is checked when printing."
          : "Open printer settings"
      }
      onClick={onOpenSettings}
    >
      <i aria-hidden="true" />
      <span aria-live="polite">{label}</span>
    </button>
  );
}
