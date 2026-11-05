import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../lib/db";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";
import { lineAmount } from "../lib/money";

test("decimal fixture and precision rejection", () => {
  assert.equal(lineAmount("79.910", "219"), 1750029);
  assert.equal(lineAmount("5.950", "239"), 142205);
  assert.equal(lineAmount("34", "10"), 34000);
  assert.equal(
    lineAmount("79.910", "219") +
      lineAmount("5.950", "239") +
      lineAmount("34", "10"),
    1926234,
  );
  assert.throws(() => lineAmount("1.0001", "219"));
});

test("connected receiving, transfer, credit sale, payments, return, costs and journals", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (action: string, data: Record<string, unknown>, key?: string) =>
    execute(db, action, data, key ?? `test-${++n}`, "owner");
  const p = await run("product", {
    code: "P1",
    name: "Pork shoulder",
    category: "Pork",
    unit: "kg",
    retail: "239",
    bulk: "219",
    box: "219",
    lowStock: "5",
  });
  const s = await run("party", { name: "Supplier", kind: "supplier" });
  const c = await run("party", { name: "Customer", kind: "customer" });
  const order = await run("purchase", {
    partyId: s.id,
    lines: [{ productId: p.id, quantity: "100", cost: "150", boxes: 4 }],
    reference: "SUP-1",
  });
  assert.equal((await snapshot(db)).stock.length, 0);
  await run("receive", {
    orderId: order.id,
    locationId: "storage",
    lines: [{ index: 0, quantity: "60", boxes: 2 }],
  });
  await run("receive", {
    orderId: order.id,
    locationId: "storage",
    lines: [{ index: 0, quantity: "40", boxes: 2 }],
  });
  await assert.rejects(() =>
    run("receive", {
      orderId: order.id,
      locationId: "storage",
      lines: [{ index: 0, quantity: "1" }],
    }),
  );
  await run("transfer", {
    productId: p.id,
    from: "storage",
    to: "freezer",
    quantity: "90",
    reason: "Retail replenishment",
  });
  const saleData = {
    partyId: c.id,
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "5.950", tier: "retail" }],
    tendered: "500",
  };
  const [sale, retry] = await Promise.all([
    run("sale", saleData, "same-sale"),
    run("sale", saleData, "same-sale"),
  ]);
  assert.equal(sale.id, retry.id);
  assert.equal(sale.total, 142205);
  assert.equal(sale.paid, 50000);
  await assert.rejects(() =>
    run("sale", { ...saleData, tendered: "0" }, "same-sale"),
  );
  await run("payment", {
    documentId: sale.id,
    amount: "922.05",
    tendered: "1000",
  });
  await run("supplierPayment", { documentId: order.id, amount: "5000" });
  await run("expense", {
    category: "Electricity",
    payee: "Utility",
    amount: "250",
    date: "2026-10-30",
    notes: "Freezers",
  });
  await run("product", {
    id: p.id,
    code: "P1",
    name: "Pork shoulder",
    category: "Pork",
    unit: "kg",
    retail: "999",
    bulk: "900",
    lowStock: "5",
  });
  let state = await snapshot(db);
  assert.equal(
    state.documents.find((d: any) => d.id === sale.id)!.data.total,
    142205,
  );
  assert.equal(
    state.stock.find((x: any) => x.location_id === "freezer")!.quantity,
    84050,
  );
  const ret = await run("return", {
    saleId: sale.id,
    index: 0,
    quantity: "1.950",
    restock: true,
    reason: "Customer return",
  });
  assert.equal(ret.total, 46605);
  await assert.rejects(() =>
    run("return", {
      saleId: sale.id,
      index: 0,
      quantity: "5",
      restock: true,
      reason: "Too much",
    }),
  );
  await assert.rejects(() =>
    run("sale", {
      locationId: "freezer",
      lines: [
        { productId: p.id, quantity: "80", tier: "retail" },
        { productId: p.id, quantity: "80", tier: "retail" },
      ],
      tendered: "0",
    }),
  );
  await assert.rejects(() =>
    run("transfer", {
      productId: p.id,
      from: "storage",
      to: "freezer",
      quantity: "11",
      reason: "Overdraw",
    }),
  );
  state = await snapshot(db);
  assert.equal(state.report.revenue, 95600);
  assert.equal(state.report.cogs, 60000);
  assert.equal(state.report.expenses, 25000);
  assert.equal(state.report.netProfit, 10600);
  assert.equal(state.report.receivables, 0);
  assert.equal(state.report.payables, 1000000);
  assert.equal(state.report.inventory, 1440000);
  assert.equal(state.report.balanced, true);
  for (const entry of state.journals) assert.equal(entry.debit, entry.credit);
  await assert.rejects(() => db.query("DELETE FROM movements"));
  await db.close();
});

test("changing receipt costs use weighted average and binary backup restores full ledger", async () => {
  const db = new PGlite();
  await migrate(db);
  let n = 0;
  const run = (a: string, d: any) => execute(db, a, d, `r${++n}`, "owner");
  const p = await run("product", {
    code: "A",
    name: "Average cost",
    category: "Other",
    unit: "kg",
    retail: "300",
  });
  await run("adjust", {
    productId: p.id,
    locationId: "freezer",
    quantity: "10",
    cost: "100",
    reason: "Opening inventory",
    kind: "count",
  });
  const supplier = await run("party", { name: "Supplier", kind: "supplier" });
  const po = await run("purchase", {
    partyId: supplier.id,
    lines: [{ productId: p.id, quantity: "10", cost: "200" }],
  });
  await run("receive", {
    orderId: po.id,
    locationId: "freezer",
    lines: [{ index: 0, quantity: "10" }],
  });
  const sale = await run("sale", {
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "2", tier: "retail" }],
    tendered: "1000",
  });
  assert.equal(sale.cogs, 30000);
  assert.equal(sale.change, 40000);
  const archive = await db.dumpDataDir("gzip");
  const restored = new PGlite({ loadDataDir: archive });
  await restored.waitReady;
  const a = await snapshot(db),
    b = await snapshot(restored);
  assert.deepEqual(b.report, a.report);
  assert.equal(b.movements.length, a.movements.length);
  assert.equal(b.documents.length, a.documents.length);
  await restored.close();
  await db.close();
});

test("bulk boundary, service stock, physical counts, spoilage, partial refund and missing prices", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (a: string, d: any) => execute(db, a, d, `k${++n}`, "owner");
  const p = await run("product", {
    code: "B",
    name: "Beef",
    category: "Beef",
    unit: "kg",
    retail: "200",
    bulk: "180",
  });
  await run("adjust", {
    productId: p.id,
    locationId: "freezer",
    quantity: "10",
    cost: "100",
    reason: "Opening count",
    kind: "count",
  });
  await assert.rejects(() =>
    run("sale", {
      locationId: "freezer",
      lines: [{ productId: p.id, quantity: "4.999", tier: "bulk" }],
      tendered: "0",
    }),
  );
  await assert.rejects(() =>
    run("sale", {
      locationId: "freezer",
      lines: [{ productId: p.id, quantity: "5", tier: "box" }],
      tendered: "0",
    }),
  );
  const party = await run("party", {
    kind: "customer",
    name: "Credit customer",
  });
  const sale = await run("sale", {
    partyId: party.id,
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "5", tier: "bulk" }],
    tendered: "100",
  });
  const ret = await run("return", {
    saleId: sale.id,
    index: 0,
    quantity: "1",
    restock: false,
    reason: "Spoiled after sale",
  });
  assert.equal(ret.refund, 0);
  assert.equal(ret.credit, 18000);
  const service = await run("product", {
    code: "G",
    name: "Grinding",
    category: "Services",
    unit: "service",
    serviceUnit: "portion",
    retail: "10",
  });
  const sv = await run("sale", {
    locationId: "freezer",
    lines: [{ productId: service.id, quantity: "34", tier: "retail" }],
    tendered: "400",
  });
  assert.equal(sv.change, 6000);
  await run("adjust", {
    productId: p.id,
    locationId: "freezer",
    quantity: "1",
    kind: "spoilage",
    reason: "Thawed",
  });
  const state = await snapshot(db);
  assert.equal(state.stock[0].quantity, 4000);
  assert.equal(state.report.balanced, true);
  await db.close();
});
