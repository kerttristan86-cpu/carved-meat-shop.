"use client";
import { Toast } from "./notifications";
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
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
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
    setMessageTone("info");
    setOperation("Printing…");
    setMessage(`Printing on ${name}…`);
    try {
      await printBluetoothReceipt(window.document.getElementById("receipt")!);
      setMessage(
        `Receipt sent to ${name}. Check the paper. To print another copy, tap Print receipt.`,
      );
    } catch (e) {
      setMessageTone("error");
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
    setMessageTone("info");
    setOperation("Connecting…");
    try {
      const name = await connectBluetoothPrinter();
      setConnection(name);
      setMessageTone("info");
      setOperation("");
      if (freshSale) await autoPrint(name);
      else
        setMessage(
          `Connected to ${name}. New sales will now print by themselves. Tap Print receipt to reprint this one.`,
        );
    } catch (e) {
      setMessageTone("error");
      setConnection(bluetoothPrinterName());
      setMessage((e as Error).message);
    } finally {
      setOperation("");
    }
  }
  async function saveImage() {
    setMessageTone("info");
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
      setMessageTone("error");
      setMessage((e as Error).message);
    } finally {
      setOperation("");
    }
  }
  async function print() {
    setMessageTone("info");
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
      setMessageTone("error");
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
            "--receipt-font": "16px",
          } as React.CSSProperties
        }
      >
        <img src="/carved-logo-transparent.png" alt="CARVED Meat Shop" />
        <h3>{settings.name}</h3>
        {settings.address && <p>{settings.address}</p>}
        {settings.contact && <p>{settings.contact}</p>}
        {settings.invoiceDetails && <p>{settings.invoiceDetails}</p>}
        <h4>
          {slip
            ? "Internal order slip · not an invoice"
            : "Request for payment"}
        </h4>

        <p>
          {number(d, settings)}
          <br />
          {date(d.created_at)} · Sta. Cruz, Laguna
          <br />
          Operator: Shop owner
          <br />
          Customer:{" "}
          {d.data.fulfillment === "delivery" && customer === "Walk-in customer"
            ? d.data.delivery?.recipient || customer
            : customer}
        </p>
        {d.data.fulfillment === "delivery" && d.data.delivery && (
          <p className="receipt-delivery">
            <strong>DELIVERY</strong>
            <br />
            Payment:{" "}
            {d.data.delivery.paymentMethod === "cod"
              ? "Cash on delivery (COD)"
              : "Cash paid now"}
            <br />
            {d.data.delivery.recipient && (
              <>
                Deliver to: {d.data.delivery.recipient}
                <br />
              </>
            )}
            {d.data.delivery.contact && <>Contact: {d.data.delivery.contact}</>}
            {d.data.delivery.address && (
              <>
                <br />
                {d.data.delivery.address}
              </>
            )}
            {d.data.delivery.notes && (
              <>
                <br />
                Notes: {d.data.delivery.notes}
              </>
            )}
          </p>
        )}
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
            {l.weightEntries?.length > 0 && (
              <p className="receipt-weight-entries">
                Weights (kg):{" "}
                {l.weightEntries.map((n: number) => qty(n)).join(" + ")}
              </p>
            )}
          </div>
        ))}
        <hr />
        <div className="receipt-total receipt-grand-total">
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
          This document is not valid for input tax. This is a request for
          payment. This is not a sales invoice. Please ask for your sales
          invoice.
        </p>
      </div>
      <div className="receipt-tools bottom" aria-busy={busy}>
        {busy && <LoadingIndicator label={operation} />}
        <Toast
          message={busy ? "" : message}
          tone={messageTone}
          onDismiss={() => setMessage("")}
        />
        <button disabled={busy} onClick={() => setSlip((v) => !v)}>
          {slip ? "View request for payment" : "View internal order slip"}
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
                localStorage.setItem("carved-print-quality-v2", value);
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
          Sharper prints at 576 dots with 16px text and a larger total. Fast uses
          the printer's fixed-size font and PHP currency labels.
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
