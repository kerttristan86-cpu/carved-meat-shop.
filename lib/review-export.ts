type R = Record<string, any>;
export const reviewFields = [
  "Customer",
  "Products",
  "Paid at checkout PHP",
  "Current balance PHP",
] as const;
export function reviewRows(
  documents: R[],
  ids: string[],
  parties: R[],
  settings: R,
  fields: string[],
): any[][] {
  const sales = documents.filter((d) => d.kind === "sale"),
    selected = sales.filter((d) => ids.includes(d.id));
  return [
    [
      "Selected invoices — accountant review; subset, not a complete BIR sales report",
    ],
    ["All saved sales count", sales.length],
    ["Selected sales count", selected.length],
    [
      "All saved gross sales PHP",
      (sales.reduce((s, d) => s + d.data.total, 0) / 100).toFixed(2),
    ],
    [
      "Selected gross sales PHP",
      (selected.reduce((s, d) => s + d.data.total, 0) / 100).toFixed(2),
    ],
    [],
    [
      "Invoice",
      "Date UTC",
      ...fields,
      "Original sale PHP",
      "Linked returns PHP",
      "Net sale PHP",
    ],
    ...selected.map((d) => {
      const returns = documents
        .filter((r) => r.kind === "return" && r.data.saleId === d.id)
        .reduce((s, r) => s + r.data.total, 0);
      const optional: R = {
        Customer:
          parties.find((p) => p.id === d.party_id)?.name || "Walk-in customer",
        Products: d.data.lines.map((l: R) => l.name).join("; "),
        "Paid at checkout PHP": (d.data.paid / 100).toFixed(2),
        "Current balance PHP": (d.balance / 100).toFixed(2),
      };
      return [
        `${d.data.shop?.prefix || settings.prefix}-${String(d.number).padStart(6, "0")}`,
        new Date(d.created_at).toISOString(),
        ...fields.map((f) => optional[f]),
        (d.data.total / 100).toFixed(2),
        (returns / 100).toFixed(2),
        ((d.data.total - returns) / 100).toFixed(2),
      ];
    }),
  ];
}
