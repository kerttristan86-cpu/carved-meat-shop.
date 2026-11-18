import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWeightEntries,
  validateWeightEntries,
} from "../lib/weight-entries";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";
test("multiple weights sum in exact grams and reject invalid or mismatched entries", () => {
  const batch = parseWeightEntries("11.67\n11.46\n11.39");
  assert.equal(batch.quantity, "34.520");
  assert.equal(batch.boxes, 3);
  assert.deepEqual(batch.grams, [11670, 11460, 11390]);
  assert.throws(() => parseWeightEntries("1\n0"), /positive/i);
  assert.throws(() => parseWeightEntries("1.0001"), /decimal/i);
  assert.throws(
    () => parseWeightEntries(Array(101).fill("1").join("\n")),
    /100/,
  );
  assert.throws(() => validateWeightEntries(batch.entries, "34.000"), /match/i);
});
test("multi-box sale stores all weights, charges the summed kg once and deducts stock exactly once", async () => {
  const db = await testDatabase();
  try {
    const p = await execute(
      db,
      "product",
      {
        name: "Multi box pork",
        code: "MW",
        category: "Pork",
        unit: "kg",
        retail: "200",
        box: "170",
      },
      "p",
      "owner",
    );
    const supplier = await execute(
      db,
      "party",
      { name: "Supplier", kind: "supplier" },
      "supplier",
      "owner",
    );
    await execute(
      db,
      "restock",
      {
        productId: p.id,
        partyId: supplier.id,
        locationId: "freezer",
        quantity: "40",
        cost: "100",
      },
      "restock",
      "owner",
    );
    const line = {
      productId: p.id,
      tier: "box",
      quantity: "34.520",
      boxes: 3,
      weightEntries: ["11.67", "11.46", "11.39"],
    };
    const before = await snapshot(db);
    await assert.rejects(
      execute(
        db,
        "sale",
        {
          locationId: "freezer",
          lines: [{ ...line, quantity: "34" }],
          tendered: "6000",
        },
        "bad",
        "owner",
      ),
      /match/i,
    );
    await assert.rejects(
      execute(
        db,
        "sale",
        {
          locationId: "freezer",
          lines: [{ ...line, boxes: 2 }],
          tendered: "6000",
        },
        "bad-boxes",
        "owner",
      ),
      /box count/i,
    );
    assert.deepEqual((await snapshot(db)).stock, before.stock);
    const draft = await execute(
      db,
      "draft",
      { locationId: "freezer", lines: [line] },
      "draft",
      "owner",
    );
    const data = {
      locationId: "freezer",
      lines: [line],
      tendered: "6000",
      draftId: draft.id,
    };
    const sale = await execute(db, "sale", data, "sale", "owner");
    assert.deepEqual(
      await execute(db, "sale", data, "sale", "owner"),
      JSON.parse(JSON.stringify(sale)),
    );
    const s = await snapshot(db);
    const stored = s.documents.find((d) => d.id === sale.id)!;
    assert.equal(stored.data.total, 586840);
    assert.equal(stored.data.change, 13160);
    assert.deepEqual(stored.data.lines[0].weightEntries, [11670, 11460, 11390]);
    assert.equal(stored.data.lines[0].boxes, 3);
    assert.equal(
      s.stock.find((x: any) => x.product_id === p.id && x.location_id === "freezer")!
        .quantity,
      5480,
    );
    assert.equal(s.report.balanced, true);
  } finally {
    await db.close();
  }
});
