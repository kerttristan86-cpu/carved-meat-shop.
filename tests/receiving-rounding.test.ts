import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";

for (const mode of [
  "separate deliveries",
  "repeated same-index lines",
] as const) {
  test(`partial receiving rounds cumulative cost for ${mode}`, async () => {
    const db = await testDatabase();
    let sequence = 0;
    const run = (action: string, data: Record<string, unknown>) =>
      execute(db, action, data, `receiving-rounding-${++sequence}`, "owner");
    try {
      const product = await run("product", {
        name: "Rounding product",
        category: "Pork",
        unit: "kg",
        retail: "10",
      });
      const supplier = await run("party", {
        name: "Supplier",
        kind: "supplier",
      });
      const order = await run("purchase", {
        partyId: supplier.id,
        lines: [{ productId: product.id, quantity: "0.004", cost: "5" }],
      });
      const line = { index: 0, quantity: "0.001" };
      if (mode === "separate deliveries") {
        for (let i = 0; i < 4; i++)
          await run("receive", {
            orderId: order.id,
            locationId: "storage",
            lines: [line],
          });
      } else {
        await run("receive", {
          orderId: order.id,
          locationId: "storage",
          lines: [line, line, line, line],
        });
      }
      const state = await snapshot(db);
      assert.equal(state.stock[0].quantity, 4);
      assert.equal(state.report.inventory, 2);
      assert.equal(state.report.payables, 2);
      assert.equal(state.report.balanced, true);
      assert.equal(
        state.documents
          .filter((d) => d.kind === "receive")
          .reduce((sum, d) => sum + d.data.total, 0),
        2,
      );
      await assert.rejects(
        () =>
          run("receive", {
            orderId: order.id,
            locationId: "storage",
            lines: [line],
          }),
        /exceeds ordered/,
      );
    } finally {
      await db.close();
    }
  });
}

test("ordinary fractional deliveries reconcile to the full ordered line cost", async () => {
  const db = await testDatabase();
  let sequence = 0;
  const run = (action: string, data: Record<string, unknown>) =>
    execute(db, action, data, `ordinary-receiving-${++sequence}`, "owner");
  try {
    const product = await run("product", {
      name: "Pork",
      category: "Pork",
      unit: "kg",
      retail: "239",
    });
    const supplier = await run("party", { name: "Supplier", kind: "supplier" });
    const order = await run("purchase", {
      partyId: supplier.id,
      lines: [{ productId: product.id, quantity: "1.500", cost: "219.99" }],
    });
    for (let i = 0; i < 3; i++)
      await run("receive", {
        orderId: order.id,
        locationId: "storage",
        lines: [{ index: 0, quantity: "0.500" }],
      });
    const state = await snapshot(db);
    assert.equal(state.report.inventory, 32999);
    assert.equal(state.report.payables, 32999);
  } finally {
    await db.close();
  }
});
