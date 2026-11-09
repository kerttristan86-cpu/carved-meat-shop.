"use client";
import { useRef, useState } from "react";
import { reconcileMonth, manilaDay } from "../../lib/invoice-reconciliation";
import { php } from "../../lib/money";
import {
  Field,
  number,
  date,
  download,
  Pill,
  Modal,
  LoadingIndicator,
} from "./shared";
type R = Record<string, any>;
export default function InvoiceReconciliation({
  state: s,
  mutate,
}: {
  state: R;
  mutate: (action: string, data: R, key?: string) => Promise<R>;
}) {
  const [month, setMonth] = useState(manilaDay(new Date()).slice(0, 7)),
    [filter, setFilter] = useState("All"),
    [allUnmatched, setAllUnmatched] = useState(false),
    [sale, setSale] = useState<R | null>(null),
    [form, setForm] = useState<R>({}),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const key = useRef(""),
    fingerprint = useRef("");
  const r = reconcileMonth(s.documents, month);
  const all = r.sales;
  const unmatched = allUnmatched
    ? s.documents
        .filter((d: R) => d.kind === "sale" && !r.links.has(d.id))
        .map((d: R) => ({ ...d, status: "Unmatched" }))
    : all;
  const visible = unmatched.filter(
    (d: R) => filter === "All" || d.status === filter,
  );
  function edit(d: R) {
    setSale(d);
    setError("");
    const l = r.links.get(d.id);
    setForm({
      invoiceNumber: l?.data.invoiceNumber || "",
      invoiceDate: l?.data.invoiceDate || manilaDay(new Date()),
      invoiceAmount: ((l?.data.invoiceAmount ?? d.data.total) / 100).toFixed(2),
      reason: l ? "" : "Initial invoice link",
      previousLinkId: l?.id || null,
    });
    key.current = crypto.randomUUID();
    fingerprint.current = "";
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!sale || saving) return;
    setSaving(true);
    setError("");
    const data = { ...form, saleId: sale.id },
      fp = JSON.stringify(data);
    if (fingerprint.current !== fp) {
      key.current = crypto.randomUUID();
      fingerprint.current = fp;
    }
    try {
      await mutate("invoiceLink", data, key.current);
      setSale(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function exportMonth() {
    const label = (id: string) => {
      const d = s.documents.find((d: R) => d.id === id);
      return d ? number(d, s.settings) : id;
    };
    download(`invoice-reconciliation-${month}.csv`, [
      [
        "Monthly invoice reconciliation — all saved sales and returns in period; accountant review, not a tax return",
      ],
      ["Manila month", month],
      ["Sales count", all.length],
      ["Unmatched sales count", r.unmatched],
      ["Amount discrepancies", r.review],
      ["Gross sales PHP", (r.gross / 100).toFixed(2)],
      ["Returns posted in month PHP", (r.returned / 100).toFixed(2)],
      ["Net sales PHP", (r.net / 100).toFixed(2)],
      [],
      [
        "Record type",
        "Sale reference",
        "Posting date UTC",
        "Official invoice",
        "Invoice date",
        "Original sale PHP",
        "Invoice amount PHP",
        "Return PHP",
        "Match status",
        "Link reason",
      ],
      ...all.map((d: R) => [
        "Sale",
        label(d.id),
        new Date(d.created_at).toISOString(),
        d.link?.data.invoiceNumber || "",
        d.link?.data.invoiceDate || "",
        (d.data.total / 100).toFixed(2),
        d.link ? (d.link.data.invoiceAmount / 100).toFixed(2) : "",
        0,
        d.status,
        d.link?.data.reason || "",
      ]),
      ...r.returns.map((d: R) => {
        const l = r.links.get(d.data.saleId);
        return [
          "Return",
          label(d.data.saleId),
          new Date(d.created_at).toISOString(),
          l?.data.invoiceNumber || "",
          l?.data.invoiceDate || "",
          "",
          "",
          (d.data.total / 100).toFixed(2),
          "Linked reversal",
          "",
        ];
      }),
      ...r.crossPeriodLinks.map((l: R) => [
        "Cross-period invoice link",
        label(l.data.saleId),
        "",
        l.data.invoiceNumber,
        l.data.invoiceDate,
        "",
        (l.data.invoiceAmount / 100).toFixed(2),
        "",
        "Sale outside selected month",
        l.data.reason,
      ]),
    ]);
  }
  return (
    <details className="review-export" open>
      <summary>Official invoice tracking & monthly reconciliation</summary>
      <div className="info">
        Link references from your existing authorized invoices. Linking does not
        issue an official invoice or change sales totals. Unmatched sales remain
        in every complete sales report. Amount mismatches require review.
      </div>
      <div className="review-controls">
        <Field label="Reconciliation month (Manila)">
          <input
            aria-label="Reconciliation month"
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </Field>
        <Field label="Match status">
          <select
            aria-label="Invoice match status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["All", "Unmatched", "Amount needs review", "Linked"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <button onClick={exportMonth}>Export complete month CSV</button>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={allUnmatched}
          onChange={(e) => setAllUnmatched(e.target.checked)}
        />{" "}
        Show unmatched sales from all dates (export always uses the full
        selected month)
      </label>
      <p>
        {all.length} sales · {r.unmatched} unmatched · {r.review} amount
        discrepancies · gross {php(r.gross)} · returns {php(r.returned)} · net{" "}
        {php(r.net)}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sale</th>
              <th>Total</th>
              <th>Official invoice</th>
              <th>Match status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d: R) => {
              const l = r.links.get(d.id);
              return (
                <tr key={d.id}>
                  <td>
                    {number(d, s.settings)}
                    <small>{date(d.created_at)}</small>
                  </td>
                  <td className="numeric">{php(d.data.total)}</td>
                  <td>
                    {l?.data.invoiceNumber || "Not linked"}
                    {l && (
                      <small>
                        {l.data.invoiceDate} · {php(l.data.invoiceAmount)}
                      </small>
                    )}
                  </td>
                  <td>
                    <Pill tone={d.status === "Linked" ? "green" : "amber"}>
                      {d.status}
                    </Pill>
                  </td>
                  <td>
                    <button onClick={() => edit(d)}>
                      {l ? "Correct invoice link" : "Link official invoice"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <p>No sales match this view.</p>}
      </div>
      {sale && (
        <Modal
          busy={saving}
          ariaLabel="Link official invoice"
          onClose={() => !saving && setSale(null)}
        >
          <div className="panel-heading">
            <h2>Link official invoice</h2>
            <button
              aria-label="Close invoice link"
              disabled={saving}
              onClick={() => setSale(null)}
            >
              Close
            </button>
          </div>
          <form onSubmit={save}>
            <p>
              {number(sale, s.settings)} · actual sale {php(sale.data.total)}
            </p>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {[
              ["invoiceNumber", "Official invoice number", "text"],
              ["invoiceDate", "Official invoice date", "date"],
              ["invoiceAmount", "Official invoice amount (PHP)", "text"],
              ["reason", "Reason / correction note", "text"],
            ].map(([k, l, t]) => (
              <Field label={l} key={k}>
                <input
                  required
                  type={t}
                  value={form[k] || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [k]: e.target.value }))
                  }
                />
              </Field>
            ))}
            <p className="muted">
              Reference only. Any difference from the sale amount remains
              flagged. Corrections retain their history.
            </p>
            <button className="primary wide" disabled={saving}>
              {saving ? (
                <LoadingIndicator label="Saving…" inline />
              ) : (
                "Save invoice link"
              )}
            </button>
          </form>
        </Modal>
      )}
    </details>
  );
}
