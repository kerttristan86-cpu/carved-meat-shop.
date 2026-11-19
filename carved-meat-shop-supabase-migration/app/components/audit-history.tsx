"use client";
import { useState } from "react";
import { auditDisplay } from "../../lib/audit-display";
import { date, Empty, Pill } from "./shared";
type R = Record<string, any>;
export default function AuditHistory({ shop }: { shop: R }) {
  const [query, setQuery] = useState("");
  const records = (shop.audit || []).map((a: R) => ({
    a,
    display: auditDisplay(a, shop),
  }));
  const filtered = records.filter(({ a, display }: R) =>
    JSON.stringify([
      display,
      a.operator_name ||
        (a.actor === "SAMPLE seed" ? "Sample data setup" : "Previous operator"),
    ])
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Shop activity</h2>
          <p>{filtered.length} records · Times shown in Asia/Manila</p>
        </div>
        <label className="field">
          <span>Search activity</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Action, product or reference"
          />
        </label>
      </div>
      {!filtered.length ? (
        <Empty>No activity matches your search.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>Operator</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ a, display }: R) => (
                <tr key={a.id}>
                  <td>{date(a.created_at)}</td>
                  <td>
                    <Pill>{display.action}</Pill>
                    {display.reference && (
                      <p>
                        <strong>{display.reference}</strong>
                      </p>
                    )}
                  </td>
                  <td>
                    {a.operator_name ||
                      (a.actor === "SAMPLE seed"
                        ? "Sample data setup"
                        : "Previous operator")}
                  </td>
                  <td>
                    <p>
                      {display.details
                        .slice(0, 2)
                        .map(([label, value]: string[]) => `${label}: ${value}`)
                        .join(" · ") || "Change recorded"}
                    </p>
                    <details className="audit-details">
                      <summary>View details</summary>
                      <dl>
                        {display.details.map(
                          ([label, value]: string[], i: number) => (
                            <div key={i}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                      {display.lines.length > 0 && (
                        <ul className="audit-items">
                          {display.lines.map((line: R, i: number) => (
                            <li key={i}>
                              <strong>{line.name}</strong>
                              <span>
                                {line.quantity}
                                {line.price && ` × ${line.price}`}
                                {line.tier && ` · ${line.tier}`}
                              </span>
                              {line.amount && <b>{line.amount}</b>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {!display.details.length && !display.lines.length && (
                        <p>This change was recorded successfully.</p>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
