import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";
test("unused records delete once, with original details preserved in audit", async () => {
  const db = await testDatabase();
  try {
    const p = await execute(
      db,
      "product",
      {
        name: "Unused product",
        code: "DEL",
        category: "Pork",
        unit: "kg",
        retail: "100",
      },
      "create",
      "owner",
    );
    const input = { entity: "product", id: p.id, reason: "Added by mistake" };
    const deleted = await execute(db, "delete", input, "delete", "owner");
    assert.equal(deleted.deleted, true);
    assert.deepEqual(
      await execute(db, "delete", input, "delete", "owner"),
      deleted,
    );
    const s = await snapshot(db);
    assert.equal(s.products.length, 0);
    assert.equal(s.audit.filter((a) => a.action === "delete").length, 1);
    assert.equal(
      s.audit.find((a) => a.action === "delete")!.data.result.record.name,
      "Unused product",
    );
  } finally {
    await db.close();
  }
});
test("deletion is limited to products and protects products referenced by saved drafts", async () => {
  const db = await testDatabase();
  try {
    const party = await execute(
      db,
      "party",
      { name: "Keep contact", kind: "customer" },
      "keep-party",
      "owner",
    );
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "party", id: party.id, reason: "Wrong scope" },
        "dp",
        "owner",
      ),
      /products only/i,
    );
    const p = await execute(
      db,
      "product",
      {
        name: "Service",
        code: "S",
        category: "Service",
        unit: "service",
        retail: "100",
      },
      "p",
      "owner",
    );
    await execute(
      db,
      "draft",
      {
        locationId: "freezer",
        lines: [{ productId: p.id, quantity: "1", tier: "retail" }],
      },
      "draft",
      "owner",
    );
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "product", id: p.id, reason: "Referenced" },
        "ref",
        "owner",
      ),
      /history|referenced/i,
    );
    assert.equal((await snapshot(db)).parties.length, 1);
  } finally {
    await db.close();
  }
});
