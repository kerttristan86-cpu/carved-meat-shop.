import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewRows } from "../lib/review-export";
test("selected review exports keep scope, original totals and linked returns visible", () => {
  const docs = [
    {
      id: "a",
      kind: "sale",
      number: 1,
      created_at: "2026-10-30T00:00:00Z",
      data: { total: 10000, paid: 10000, lines: [] },
      balance: 0,
    },
    {
      id: "b",
      kind: "sale",
      number: 2,
      created_at: "2026-10-30T00:00:00Z",
      data: { total: 20000, paid: 0, lines: [] },
      balance: 20000,
    },
    { id: "r", kind: "return", data: { saleId: "a", total: 1000 } },
  ];
  const rows = reviewRows(docs, ["a"], [], { prefix: "CV" }, []);
  assert.match(String(rows[0][0]), /selected invoices/i);
  assert.ok(rows.some((r) => r[0] === "All saved sales count" && r[1] === 2));
  assert.ok(rows.some((r) => r[0] === "Selected sales count" && r[1] === 1));
  assert.deepEqual(rows.at(-1)?.slice(-3), ["100.00", "10.00", "90.00"]);
  assert.equal(docs.length, 3);
});
