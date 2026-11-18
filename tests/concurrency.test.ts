import { test } from "node:test";
import assert from "node:assert/strict";
import { execute, snapshot } from "../lib/shop";
import { testDatabase, usingPostgres } from "./support/test-db";

const skip = usingPostgres()
  ? false
  : "Set TEST_DATABASE_URL; embedded PGlite has a single connection";

async function shop() {
  const db = await testDatabase();
  let n = 0;
  const run = (action: string, data: Record<string, unknown>, key?: string) =>
    execute(db, action, data, key ?? `setup-${++n}`, "owner");
  const product = await run("product", {
    code: "RACE",
    name: "Race product",
    category: "Pork",
    unit: "kg",
    retail: "200",
  });
  const supplier = await run("party", { name: "Supplier", kind: "supplier" });
  await run("restock", {
    productId: product.id,
    partyId: supplier.id,
    locationId: "freezer",
    quantity: "5",
    cost: "100",
  });
  return { db, run, product };
}

test("simultaneous sales never oversell and stay balanced", { skip }, async () => {
  const { db, run, product } = await shop();
  const sale = {
    locationId: "freezer",
    lines: [{ productId: product.id, quantity: "1", tier: "retail" }],
    tendered: "200",
  };
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => run("sale", sale, `race-sale-${i}`)),
  );
  const saved = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult[];
  assert.equal(saved.length, 5);
  for (const r of rejected) assert.match(r.reason.message, /stock/i);
  const state = await snapshot(db);
  assert.equal(state.stock[0].quantity, 0);
  assert.equal(state.report.inventory, 0);
  // Weighted-average cost is read from this row, so it must not lose an update.
  const valuation = (await db.query("SELECT quantity, value FROM valuation"))
    .rows[0] as { quantity: number; value: number };
  assert.deepEqual(
    [Number(valuation.quantity), Number(valuation.value)],
    [0, 0],
  );
  assert.equal(state.report.revenue, 100000);
  assert.equal(state.report.balanced, true);
  assert.equal(
    state.documents.filter((d) => d.kind === "sale").length,
    5,
  );
  await db.close();
});

test("simultaneous retries of one request save it exactly once", { skip }, async () => {
  const { db, run, product } = await shop();
  const sale = {
    locationId: "freezer",
    lines: [{ productId: product.id, quantity: "1", tier: "retail" }],
    tendered: "200",
  };
  const results = await Promise.all(
    Array.from({ length: 6 }, () => run("sale", sale, "one-key")),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  const state = await snapshot(db);
  assert.equal(state.stock[0].quantity, 4000);
  assert.equal(
    state.documents.filter((d) => d.kind === "sale").length,
    1,
  );
  await db.close();
});

test("simultaneous payments cannot overpay one credit sale", { skip }, async () => {
  const { db, run, product } = await shop();
  const customer = await run("party", { name: "Customer", kind: "customer" });
  const sale = await run("sale", {
    partyId: customer.id,
    locationId: "freezer",
    lines: [{ productId: product.id, quantity: "1", tier: "retail" }],
    tendered: "0",
  });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      run(
        "payment",
        { documentId: sale.id, amount: "100", tendered: "100" },
        `race-payment-${i}`,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  const state = await snapshot(db);
  assert.equal(state.report.receivables, 0);
  assert.equal(state.report.balanced, true);
  await db.close();
});
