import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCartLine,
  restoreCart,
  stockStatus,
  periodStart,
} from "../lib/ui-validation";
test("cart rejects oversized quantities and discards corrupt saved lines", () => {
  assert.throws(() =>
    validateCartLine({ quantity: "1000000000", price: 23900 }),
  );
  assert.equal(
    restoreCart([{ quantity: "1000000000", price: 23900 }]).length,
    0,
  );
  assert.equal(
    restoreCart([
      {
        quantity: "1.000",
        price: 23900,
        productId: "p",
        name: "P",
        tier: "retail",
      },
    ]).length,
    1,
  );
});
test("Manila week boundaries and clear stock status", () => {
  assert.equal(
    periodStart("week", new Date("2026-10-29T17:30:00Z")),
    "2026-10-24",
  );
  assert.equal(stockStatus(0, 5000).label, "Out of stock");
  assert.equal(stockStatus(9000, 10000).label, "Low stock");
  assert.equal(stockStatus(10001, 10000).label, "In stock");
});
