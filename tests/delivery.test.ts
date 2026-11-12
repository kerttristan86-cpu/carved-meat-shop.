import { test } from "node:test";
import assert from "node:assert/strict";
import { quantity } from "../lib/money";
import { parseFulfillment } from "../lib/fulfillment";
import { execute, snapshot } from "../lib/shop";
import { testDatabase } from "./support/test-db";
test("decimal shorthand and six differently weighted boxes keep exact kg", () => {
  assert.equal(quantity(".50"), 500);
  assert.equal(quantity(".005"), 5);
  assert.throws(() => quantity(".0001"));
  assert.equal(parseFulfillment(undefined).fulfillment, "walkin");
  assert.throws(() => parseFulfillment("delivery", {}), /recipient/i);
});
test("delivery survives draft/post/retry without adding fees or changing accounting", async () => {
  const db = await testDatabase();
  try {
    const p = await execute(
      db,
      "product",
      {
        code: "D",
        name: "Delivery product",
        category: "Service",
        unit: "service",
        retail: "100",
      },
      "p",
      "owner",
    );
    const data = {
      locationId: "freezer",
      lines: [{ productId: p.id, tier: "retail", quantity: ".50" }],
      fulfillment: "delivery",
      delivery: {
        recipient: "Maria",
        contact: "09123456789",
        address: "Los Banos, Laguna",
        notes: "Call on arrival",
      },
    };
    await assert.rejects(
      execute(
        db,
        "draft",
        { ...data, delivery: { ...data.delivery, address: "" } },
        "invalid",
        "owner",
      ),
      /address/i,
    );
    const draft = await execute(db, "draft", data, "draft", "owner");
    const sale = await execute(
      db,
      "sale",
      { ...data, draftId: draft.id, tendered: "50" },
      "sale",
      "owner",
    );
    const again = await execute(
      db,
      "sale",
      { ...data, draftId: draft.id, tendered: "50" },
      "sale",
      "owner",
    );
    assert.equal(again.id, sale.id);
    const s = await snapshot(db);
    const stored = s.documents.find((d) => d.id === sale.id)!;
    assert.equal(stored.data.fulfillment, "delivery");
    assert.deepEqual(stored.data.delivery, data.delivery);
    assert.equal(stored.data.total, 5000);
    assert.equal(s.report.revenue, 5000);
    assert.equal(s.report.balanced, true);
    assert.deepEqual(
      s.documents.find((d) => d.id === draft.id)!.data.delivery,
      data.delivery,
    );
  } finally {
    await db.close();
  }
});
