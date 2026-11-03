"use client";
import { useState } from "react";
import { reviewRows, reviewFields } from "../../lib/review-export";
import { download, number, date, Field } from "./shared";
import { php } from "../../lib/money";
type R = Record<string, any>;
export default function ReviewExport({ state: s }: { state: R }) {
  const [ids, setIds] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [fields, setFields] = useState<string[]>(["Customer", "Products"]);
  const sales = s.documents.filter((d: R) => d.kind === "sale");
  const visible = sales.filter((d: R) => {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d.created_at));
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      `${number(d, s.settings)} ${s.parties.find((p: R) => p.id === d.party_id)?.name || "Walk-in customer"}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const selected = sales.filter((d: R) => ids.includes(d.id));
  return (
    <details className="review-export">
      <summary>Accountant review — select invoices & export fields</summary>
      <div className="info">
        Selected subset for accountant review. All invoices remain in the
        complete ledger; this export is not a complete BIR sales report.
      </div>
      <div className="review-controls">
        <Field label="Search invoice or customer">
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="From (Manila date)">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To (Manila date)">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <fieldset>
        <legend>Optional export fields</legend>
        {reviewFields.map((f) => (
          <label key={f}>
            <input
              type="checkbox"
              checked={fields.includes(f)}
              onChange={(e) =>
                setFields(
                  e.target.checked
                    ? [...fields, f]
                    : fields.filter((x) => x !== f),
                )
              }
            />
            {f}
          </label>
        ))}
      </fieldset>
      <p>
        {selected.length} selected of {sales.length} saved sales · selected
        original total{" "}
        {php(selected.reduce((n: number, d: R) => n + d.data.total, 0))}
      </p>
      <div className="row-actions">
        <button
          onClick={() =>
            setIds([...new Set([...ids, ...visible.map((d: R) => d.id)])])
          }
        >
          Select matching invoices
        </button>
        <button onClick={() => setIds([])}>Clear selection</button>
        <button
          className="primary"
          disabled={!selected.length}
          onClick={() =>
            download(
              "selected-invoices-accountant-review.csv",
              reviewRows(s.documents, ids, s.parties, s.settings, fields),
            )
          }
        >
          Export selected CSV
        </button>
      </div>
      <div className="review-list">
        {visible.map((d: R) => (
          <label key={d.id}>
            <input
              type="checkbox"
              checked={ids.includes(d.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, d.id]
                    : ids.filter((x) => x !== d.id),
                )
              }
            />
            <span>
              {number(d, s.settings)} · {date(d.created_at)}
            </span>
            <strong>{php(d.data.total)}</strong>
          </label>
        ))}
        {!visible.length && <p>No matching saved invoices.</p>}
      </div>
    </details>
  );
}
