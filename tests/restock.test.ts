import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../lib/db";
import { execute, snapshot } from "../lib/shop";
test("one-step product restock receives stock and cost exactly once", async () => {
  const db = new PGlite();
  await migrate(db);
  const p = await execute(
    db,
    "product",
    {
      code: "R",
      name: "Restock product",
      category: "Pork",
      unit: "kg",
      retail: "239",
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
  const data = {
    productId: p.id,
    partyId: supplier.id,
    locationId: "freezer",
    quantity: "2.500",
    cost: "150",
  };
  const result = await execute(db, "restock", data, "restock-1", "owner");
  assert.equal(
    (await execute(db, "restock", data, "restock-1", "owner")).id,
    result.id,
  );
  const s = await snapshot(db);
  assert.equal(s.stock[0].quantity, 2500);
  assert.equal(s.report.inventory, 37500);
  assert.equal(s.report.payables, 37500);
  assert.equal(s.report.revenue, 0);
  assert.equal(s.report.balanced, true);
  assert.equal(s.documents.length, 2);
  await db.close();
});
