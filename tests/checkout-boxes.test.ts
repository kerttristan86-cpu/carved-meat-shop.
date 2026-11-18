import { test } from "node:test";
import assert from "node:assert/strict";
import { execute, snapshot } from "../lib/shop";
import { testDatabase } from "./support/test-db";
import { validateCartLine, restoreCart } from "../lib/ui-validation";

test("cart catches fractional box counts before checkout and clears hidden box values on restored retail lines", () => {
  assert.throws(
    () =>
      validateCartLine({
        quantity: "1.250",
        price: 23900,
        tier: "box",
        boxes: 1.25,
      }),
    /Box count must be a whole number/,
  );
  assert.doesNotThrow(() =>
    validateCartLine({
      quantity: "1.250",
      price: 23900,
      tier: "box",
      boxes: 2,
    }),
  );
  const restored = restoreCart([
    {
      productId: "p",
      name: "Pork",
      quantity: "1.250",
      price: 23900,
      tier: "retail",
      boxes: 1.25,
    },
  ]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].boxes, 0);
  assert.equal(restored[0].quantity, "1.250");
});

test("decimal kg checkout ignores stale hidden boxes and invalid BOX counts roll back cleanly", async () => {
  const db = await testDatabase();
  let seq = 0;
  const run = (action: string, data: any) =>
    execute(db, action, data, "box-regression-" + ++seq, "QA");
  try {
    const p = await run("product", {
      code: "BOX-QA",
      name: "Pork shoulder",
      category: "Pork",
      unit: "kg",
      retail: "239",
      box: "219",
      lowStock: "0",
    });
    await run("adjust", {
      productId: p.id,
      locationId: "storage",
      kind: "opening",
      quantity: "20",
      cost: "100",
      reason: "QA opening stock",
    });
    const before = await snapshot(db);
    await assert.rejects(
      run("sale", {
        locationId: "storage",
        lines: [
          { productId: p.id, quantity: "0.500", tier: "retail", boxes: 0 },
          { productId: p.id, quantity: "1.250", tier: "box", boxes: 1.25 },
        ],
        tendered: "300",
      }),
      /Box count must be a whole number/,
    );
    const rejected = await snapshot(db);
    assert.equal(rejected.documents.length, before.documents.length);
    assert.deepEqual(rejected.stock, before.stock);
    assert.equal(rejected.journals.length, before.journals.length);
    const sale = await run("sale", {
      locationId: "storage",
      lines: [
        { productId: p.id, quantity: "1.250", tier: "retail", boxes: 1.25 },
        { productId: p.id, quantity: "2.500", tier: "retail", boxes: 1.25 },
      ],
      tendered: "1000",
    });
    assert.equal(sale.total, 89625);
    assert.equal(sale.change, 10375);
    assert.deepEqual(
      sale.lines.map((l: any) => l.quantity),
      [1250, 2500],
    );
    assert.deepEqual(
      sale.lines.map((l: any) => l.boxes),
      [0, 0],
    );
    const boxed = await run("sale", {
      locationId: "storage",
      lines: [{ productId: p.id, quantity: "1.250", tier: "box", boxes: 2 }],
      tendered: "300",
    });
    assert.equal(boxed.lines[0].boxes, 2);
    assert.equal(boxed.lines[0].quantity, 1250);
    assert.equal(boxed.total, 27375);
    assert.equal((await snapshot(db)).report.balanced, true);
  } finally {
    await db.close();
  }
});
