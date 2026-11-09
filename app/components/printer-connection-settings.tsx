"use client";
import { Toast } from "./notifications";
import { useEffect, useState } from "react";
import { LoadingIndicator } from "./shared";
import {
  bluetoothPrinterName,
  connectBluetoothPrinter,
} from "../../lib/thermal-printer";

export default function PrinterConnectionSettings() {
  const [connection, setConnection] = useState(bluetoothPrinterName);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const update = () => {
      if (active) setConnection(bluetoothPrinterName());
    };
    // Read local connection state only; no Bluetooth chooser or network requests.
    const timer = window.setInterval(update, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      // Keep the chooser directly in the button gesture, as Android requires.
      setConnection(await connectBluetoothPrinter());
    } catch (reason) {
      setConnection(bluetoothPrinterName());
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
        {connection ? `Connected: ${connection}` : "No printer connected"}
      </p>
      <button disabled={connecting} onClick={connect}>
        {connecting ? (
          <LoadingIndicator label="Connecting..." inline />
        ) : connection ? (
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
