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
  assert.deepEqual(parseFulfillment("delivery", {}), {
    fulfillment: "delivery",
    delivery: {
      paymentMethod: "cash_now",
      recipient: "",
      contact: "",
      address: "",
      notes: "",
    },
  });
  assert.equal(
    parseFulfillment("delivery", { paymentMethod: "cod" }).delivery
      ?.paymentMethod,
    "cod",
  );
  assert.throws(
    () => parseFulfillment("delivery", { paymentMethod: "cheque" }),
    /payment method/i,
  );
  assert.deepEqual(parseFulfillment("delivery", { recipient: "Maria" }), {
    fulfillment: "delivery",
    delivery: {
      paymentMethod: "cash_now",
      recipient: "Maria",
      contact: "",
      address: "",
      notes: "",
    },
  });
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
        paymentMethod: "cash_now",
        recipient: "Maria",
        contact: "",
        address: "",
        notes: "",
      },
    };
    const draft = await execute(db, "draft", data, "draft", "owner");
    const saleData = {
      ...data,
      delivery: {
        ...data.delivery,
        recipient: "",
        contact: "",
      },
    };
    const sale = await execute(
      db,
      "sale",
      { ...saleData, draftId: draft.id, tendered: "50" },
      "sale",
      "owner",
    );
    const again = await execute(
      db,
      "sale",
      { ...saleData, draftId: draft.id, tendered: "50" },
      "sale",
      "owner",
    );
    const codSale = await execute(
      db,
      "sale",
      {
        ...saleData,
        delivery: { ...saleData.delivery, paymentMethod: "cod" },
        tendered: "50",
      },
      "cod-sale",
      "owner",
    );
    assert.equal(again.id, sale.id);
    assert.equal(codSale.paid, 0);
    assert.equal(codSale.delivery.paymentMethod, "cod");
    const s = await snapshot(db);
    const stored = s.documents.find((d) => d.id === sale.id)!;
    assert.equal(stored.data.fulfillment, "delivery");
    assert.deepEqual(stored.data.delivery, saleData.delivery);
    assert.equal(stored.data.total, 5000);
    assert.equal(s.report.revenue, 10000);
    assert.equal(s.report.balanced, true);
    assert.deepEqual(
      s.documents.find((d) => d.id === draft.id)!.data.delivery,
      data.delivery,
    );
  } finally {
    await db.close();
  }
});
