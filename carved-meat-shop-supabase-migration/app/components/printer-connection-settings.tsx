"use client";
import { Toast } from "./notifications";
import { useState } from "react";
import { usePrinterConnection } from "./printer-status";
import { LoadingIndicator } from "./shared";
import { connectBluetoothPrinter } from "../../lib/thermal-printer";

export default function PrinterConnectionSettings() {
  const connection = usePrinterConnection();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      // Keep the chooser directly in the button gesture, as Android requires.
      await connectBluetoothPrinter();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not connect to the printer. Try again.",
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div>
      <h3>Receipt printer</h3>
      <p role="status" aria-live="polite">
        {connection.state === "connected"
          ? `Connected: ${connection.name}`
          : connection.state === "selected"
            ? "Printer selected. Connection is checked when printing."
            : connection.state === "unsupported"
              ? "Direct Bluetooth unavailable. Use system print."
              : "No printer connected"}
      </p>
      <button disabled={connecting} onClick={connect}>
        {connecting ? (
          <LoadingIndicator label="Connecting..." inline />
        ) : connection.name ? (
          "Change printer"
        ) : (
          "Connect printer"
        )}
      </button>
      <Toast message={error} tone="error" onDismiss={() => setError("")} />
      <p>
        Connect the printer on this phone or tablet. New POS sales print
        automatically while it is connected. Saved receipts print when you tap
        Print receipt.
      </p>
      <p className="muted">
        This connection is for this device and browser. If Bluetooth disconnects
        or you reopen the app, you may need to connect again. System print is
        still available from each receipt.
      </p>
    </div>
  );
}
