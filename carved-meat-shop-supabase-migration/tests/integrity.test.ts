import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";
test("reject changed price in a saved cart and use expense business date in reports", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (a: string, d: any) =>
    execute(db, a, d, "integrity-" + ++n, "owner");
  const p = await run("product", {
    code: "S",
    name: "Service",
    category: "Services",
    unit: "service",
    retail: "10",
  });
  await assert.rejects(
    () =>
      run("sale", {
        locationId: "freezer",
        lines: [
          {
            productId: p.id,
            quantity: "1",
            tier: "retail",
            expectedPrice: 900,
          },
        ],
        tendered: "10",
      }),
    /price changed/i,
  );
  await run("expense", {
    category: "Rent",
    payee: "Landlord",
    amount: "100",
    date: "2020-01-01",
  });
  const historical = await snapshot(db, "2020-01-01", "2020-01-01");
  assert.equal(historical.report.expenses, 10000);
  const current = await snapshot(db, "2026-10-30", "2026-10-30");
  assert.equal(current.report.expenses, 0);
  await db.close();
});
test("owner funding and operational count gains are distinct from revenue and opening equity", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (a: string, d: any) =>
    execute(db, a, d, "capital-" + ++n, "owner");
  await run("funds", {
    amount: "1000",
    account: "Cash",
    reason: "Opening register",
  });
  const p = await run("product", {
    code: "V",
    name: "Variance product",
    category: "Other",
    unit: "kg",
    retail: "20",
  });
  await run("adjust", {
    productId: p.id,
    locationId: "storage",
    kind: "opening",
    quantity: "1",
    cost: "10",
    reason: "Opening count",
  });
  await run("adjust", {
    productId: p.id,
    locationId: "storage",
    kind: "count",
    quantity: "2",
    cost: "10",
    reason: "Physical reconciliation",
  });
  const s = await snapshot(db);
  assert.equal(s.accounts["Owner capital"], -100000);
  assert.equal(s.accounts["Opening equity"], -1000);
  assert.equal(s.accounts["Inventory variance"], -1000);
  assert.equal(s.report.revenue, 0);
  assert.equal(s.report.cash, 100000);
  assert.equal(s.report.balanced, true);
  await db.close();
});
test("many tiny returns never refund more than original rounded amount or COGS", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (a: string, d: any) => execute(db, a, d, "tiny-" + ++n, "owner");
  const p = await run("product", {
    code: "T",
    name: "Tiny weight",
    category: "Other",
    unit: "kg",
    retail: "5",
  });
  await run("adjust", {
    productId: p.id,
    locationId: "freezer",
    kind: "count",
    quantity: "0.004",
    cost: "5",
    reason: "Opening",
  });
  const sale = await run("sale", {
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "0.004", tier: "retail" }],
    tendered: "0.02",
  });
  let refunded = 0;
  for (let i = 0; i < 4; i++) {
    const r = await run("return", {
      saleId: sale.id,
      index: 0,
      quantity: "0.001",
      restock: true,
      reason: "Tiny partial return",
    });
    refunded += r.refund;
    assert.ok(refunded <= 2);
  }
  const state = await snapshot(db);
  assert.equal(refunded, 2);
  assert.equal(state.report.revenue, 0);
  assert.equal(state.report.cogs, 0);
  assert.equal(state.report.balanced, true);
  await db.close();
});
