"use client";
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { php, qty } from "../../lib/money";
import { date, number } from "./shared";
import {
  claimAutoPrint,
  connectBluetoothPrinter,
  bluetoothPrinterName,
  printBluetoothReceipt,
  receiptCanvas,
  restoreBluetoothPrinter,
} from "../../lib/thermal-printer";

type R = Record<string, any>;

export default function ReceiptDialog({
  document: d,
  settings: s,
  related,
  customer,
  onClose,
  freshSale = false,
}: {
  document: R;
  settings: R;
  related: R[];
  customer: string;
  onClose: () => void;
  /** A sale just saved at checkout prints by itself. Reprints stay manual. */
  freshSale?: boolean;
}) {
  const [message, setMessage] = useState(""),
    [slip, setSlip] = useState(false),
    [busy, setBusy] = useState(false),
    [connection, setConnection] = useState(() => bluetoothPrinterName());
  const settings = d.data.shop || s;
  async function autoPrint(name: string) {
    if (!claimAutoPrint(d.id)) return;
    setBusy(true);
    setMessage(`Printing on ${name}…`);
    try {
      await printBluetoothReceipt(window.document.getElementById("receipt")!);
      setMessage(
        `Receipt sent to ${name}. Check the paper. To print another copy, tap Print receipt.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!freshSale) return;
    void (async () => {
      const name = await restoreBluetoothPrinter();
      setConnection(name);
      if (name) await autoPrint(name);
      else
        setMessage(
          "Sale saved. Tap Connect printer to print this receipt.",
        );
    })();
    // Runs once for each receipt that opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connect() {
    setBusy(true);
    try {
      const name = await connectBluetoothPrinter();
      setConnection(name);
      setBusy(false);
      if (freshSale) await autoPrint(name);
      else
        setMessage(
          `Connected to ${name}. New sales will now print by themselves. Tap Print receipt to reprint this one.`,
        );
    } catch (e) {
      setConnection(bluetoothPrinterName());
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveImage() {
    setBusy(true);
    try {
      const canvas = await receiptCanvas(
        window.document.getElementById("receipt")!,
      );
      const link = window.document.createElement("a");
      link.download = `CARVED-${d.number || d.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setMessage(
        "Receipt image saved. Open it in your compatible printer app to print. No new sale was posted.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    setBusy(true);
    try {
      if (connection) {
        // A manual print counts, so a later reconnect can't print this sale again.
        claimAutoPrint(d.id);
        await printBluetoothReceipt(window.document.getElementById("receipt")!);
        setMessage(
          "Receipt sent to the printer. Check the physical output before reprinting.",
        );
        return;
      }
      const { printer } = await import("../../lib/printer");
      await printer(s.printer).print();
      setMessage(
        "Print dialog requested. Confirm the physical output; this app cannot verify printing.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const payments = related.filter(
      (x) => x.kind === "payment" && x.data.documentId === d.id,
    ),
    returns = related.filter(
      (x) => x.kind === "return" && x.data.saleId === d.id,
    );
  return (
    <div className="modal-backdrop receipt-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Saved receipt preview"
        className="receipt-dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="receipt-tools">
          <div>
            <h2>{slip ? "Internal order slip" : "Saved receipt"}</h2>
            <small>Reprinting never posts another sale.</small>
          </div>
          <button autoFocus aria-label="Close receipt" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div
          id="receipt"
          style={
            {
              "--receipt-margin": `${s.margin}mm`,
              "--receipt-font": `${Math.max(13, Number(s.density) || 13)}px`,
            } as React.CSSProperties
          }
        >
          <img src="/carved-logo-transparent.png" alt="CARVED Meat Shop" />
          <h3>{settings.name}</h3>
          {settings.address && <p>{settings.address}</p>}
          {settings.contact && <p>{settings.contact}</p>}
          {settings.invoiceDetails && <p>{settings.invoiceDetails}</p>}
          <h4>
            {slip ? "Internal order slip · not an invoice" : settings.heading}
          </h4>

          <p>
            {number(d, settings)}
            <br />
            {date(d.created_at)} · Asia/Manila
            <br />
            Operator: Shop owner
            <br />
            Customer: {customer}
          </p>
          <hr />
          {d.data.lines.map((l: R, i: number) => (
            <div className="receipt-line" key={i}>
              <strong>{l.name}</strong>
              <div>
                <span>
                  {qty(l.quantity)}{" "}
                  {l.unit === "kg" ? "kg" : l.serviceUnit || "units"} ×{" "}
                  <span style={{ whiteSpace: "nowrap" }}>
                    {php(l.price)} {l.tier.toUpperCase()}
                  </span>
                  {l.boxes ? ` · ${l.boxes} boxes` : ""}
                </span>
                <b>{php(l.amount)}</b>
              </div>
            </div>
          ))}
          <hr />
          <div className="receipt-total">
            <strong>TOTAL</strong>
            <strong>{php(d.data.total)}</strong>
          </div>
          <div className="receipt-total">
            <span>Cash tendered</span>
            <span>{php(d.data.tendered)}</span>
          </div>
          <div className="receipt-total">
            <span>Change</span>
            <span>{php(d.data.change)}</span>
          </div>
          {payments.map((p) => (
            <div className="receipt-total" key={p.id}>
              <span>Later payment · {date(p.created_at)}</span>
              <span>{php(p.data.amount)}</span>
            </div>
          ))}
          {returns.map((p) => (
            <div className="receipt-total" key={p.id}>
              <span>Return · {date(p.created_at)}</span>
              <span>-{php(p.data.total)}</span>
            </div>
          ))}
          <hr />
          <p>{settings.footer}</p>
          <p className="review-note">
            Layout requires accountant review.
            <br />
            Not certified for statutory use.
          </p>
        </div>
        <div className="receipt-tools bottom">
          <p role="status">
            {message ||
              "80 mm layout · monochrome thermal preview. Physical printer compatibility is unverified."}
          </p>
          <button disabled={busy} onClick={() => setSlip((v) => !v)}>
            {slip ? "View sales invoice" : "View internal order slip"}
          </button>
          <button disabled={busy} onClick={connect}>
            {connection
              ? `Connected: ${connection}`
              : "Connect printer"}
          </button>
          <button disabled={busy} onClick={saveImage}>
            Save receipt image
          </button>
          <button
            disabled={busy}
            onClick={() => {
              window.print();
            }}
          >
            System print
          </button>
          <button disabled={busy} className="primary" onClick={print}>
            <Printer size={18} /> Print receipt
          </button>
        </div>
      </section>
    </div>
  );
}
