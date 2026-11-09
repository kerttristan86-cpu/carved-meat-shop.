"use client";
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { php, qty } from "../../lib/money";
import { date, number, Modal, LoadingIndicator } from "./shared";
import {
  claimAutoPrint,
  connectBluetoothPrinter,
  bluetoothPrinterName,
  printBluetoothReceipt,
  receiptCanvas,
  readPrintQuality,
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
    [operation, setOperation] = useState<
      "" | "Printing…" | "Connecting…" | "Preparing image…"
    >(""),
    [connection, setConnection] = useState(() => bluetoothPrinterName()),
    [quality, setQuality] = useState<"fast" | "sharp">("fast"),
    [includeLogo, setIncludeLogo] = useState(true);
  useEffect(() => {
    setQuality(readPrintQuality());
    try {
      setIncludeLogo(localStorage.getItem("carved-print-logo") !== "off");
    } catch {}
  }, []);
  const busy = operation !== "";
  const settings = d.data.shop || s;
  async function autoPrint(name: string) {
    if (!claimAutoPrint(d.id)) return;
    setOperation("Printing…");
    setMessage(`Printing on ${name}…`);
    try {
      await printBluetoothReceipt(window.document.getElementById("receipt")!);
      setMessage(
        `Receipt sent to ${name}. Check the paper. To print another copy, tap Print receipt.`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOperation("");
    }
  }
  useEffect(() => {
    if (!freshSale) return;
    // Use only the connection explicitly chosen on this browser. Never start
    // background pairing here: a late reconnect could replace a manual choice.
    const name = bluetoothPrinterName();
    setConnection(name);
    if (name) void autoPrint(name);
    else
      setMessage(
        "Sale saved. Connect a printer in Settings or tap Connect printer here.",
      );
    // Runs once for each receipt that opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connect() {
    setOperation("Connecting…");
    try {
      const name = await connectBluetoothPrinter();
      setConnection(name);
      setOperation("");
      if (freshSale) await autoPrint(name);
      else
        setMessage(
          `Connected to ${name}. New sales will now print by themselves. Tap Print receipt to reprint this one.`,
        );
    } catch (e) {
      setConnection(bluetoothPrinterName());
      setMessage((e as Error).message);
    } finally {
      setOperation("");
    }
  }
  async function saveImage() {
    setOperation("Preparing image…");
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
      setOperation("");
    }
  }
  async function print() {
    setOperation("Printing…");
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
      setOperation("");
    }
  }
  const payments = related.filter(
      (x) => x.kind === "payment" && x.data.documentId === d.id,
    ),
    returns = related.filter(
      (x) => x.kind === "return" && x.data.saleId === d.id,
    );
  return (
    <Modal
      ariaLabel="Saved receipt preview"
      busy={busy}
      onClose={onClose}
      className="receipt-dialog"
      backdropClassName="receipt-backdrop"
    >
      <div className="receipt-tools">
        <div>
          <h2>{slip ? "Internal order slip" : "Saved receipt"}</h2>
          <small>Reprinting never posts another sale.</small>
        </div>
        <button
          disabled={busy}

          aria-label="Close receipt"
          onClick={onClose}
        >
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
      <div className="receipt-tools bottom" aria-busy={busy}>
        {busy && <LoadingIndicator label={operation} />}
        <p role="status">
          {message ||
            "80 mm layout · monochrome thermal preview. Physical printer compatibility is unverified."}
        </p>
        <button disabled={busy} onClick={() => setSlip((v) => !v)}>
          {slip ? "View sales invoice" : "View internal order slip"}
        </button>
        <label className="field" style={{ width: "100%" }}>
          <span>Print mode</span>
          <select
            aria-label="Print mode"
            disabled={busy}
            value={quality}
            onChange={(e) => {
              const value = e.target.value as "fast" | "sharp";
              try {
                localStorage.setItem("carved-print-quality", value);
              } catch {
                setMessage(
                  "Cannot save print quality. Allow browser storage and try again.",
                );
                return;
              }
              setQuality(value);
            }}
          >
            <option value="fast">Fast - bolder, coarser edges</option>
            <option value="sharp">Sharper - slower printing</option>
          </select>
        </label>
        {quality === "fast" && (
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              style={{ width: 20, minHeight: 20 }}
              checked={includeLogo}
              disabled={busy}
              onChange={(e) => {
                try {
                  localStorage.setItem(
                    "carved-print-logo",
                    e.target.checked ? "on" : "off",
                  );
                  setIncludeLogo(e.target.checked);
                } catch {
                  setMessage(
                    "Allow browser storage to save print preferences.",
                  );
                }
              }}
            />
            Include logo (turn off for fastest printing)
          </label>
        )}
        <p>
          Fast text uses the printer font and PHP currency labels. The receipt
          preview keeps its original appearance.
        </p>
        <button disabled={busy} onClick={connect}>
          {connection ? `Connected: ${connection}` : "Connect printer"}
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
    </Modal>
  );
}
