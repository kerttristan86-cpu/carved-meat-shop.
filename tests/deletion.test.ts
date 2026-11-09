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
    const party = await execute(
      db,
      "party",
      { name: "Unused contact", kind: "customer" },
      "party",
      "owner",
    );
    await execute(
      db,
      "delete",
      { entity: "party", id: party.id, reason: "Duplicate" },
      "dp",
      "owner",
    );
    const loc = await execute(
      db,
      "location",
      { name: "Unused room" },
      "loc",
      "owner",
    );
    await execute(
      db,
      "delete",
      { entity: "location", id: loc.id, reason: "Duplicate" },
      "dl",
      "owner",
    );
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "location", id: "storage", reason: "Wrong" },
        "default",
        "owner",
      ),
      /default location/i,
    );
  } finally {
    await db.close();
  }
});
test("draft deletion protects posted sales, referenced products and linked drafts", async () => {
  const db = await testDatabase();
  try {
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
    const data = {
      locationId: "freezer",
      lines: [{ productId: p.id, quantity: "1", tier: "retail" }],
      tendered: "100",
    };
    const draft = await execute(db, "draft", data, "draft", "owner");
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "product", id: p.id, reason: "Unused" },
        "ref",
        "owner",
      ),
      /history|referenced/i,
    );
    await execute(
      db,
      "delete",
      { entity: "document", id: draft.id, reason: "Cancelled draft" },
      "dd",
      "owner",
    );
    const linked = await execute(db, "draft", data, "linked", "owner");
    const sale = await execute(
      db,
      "sale",
      { ...data, draftId: linked.id },
      "sale",
      "owner",
    );
    const before = await snapshot(db);
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "document", id: sale.id, reason: "Cancel" },
        "sale-delete",
        "owner",
      ),
      /posted|reversal/i,
    );
    await assert.rejects(
      execute(
        db,
        "delete",
        { entity: "document", id: linked.id, reason: "Cancel" },
        "linked-delete",
        "owner",
      ),
      /linked|posted/i,
    );
    const after = await snapshot(db);
    assert.deepEqual(after.report, before.report);
    assert.deepEqual(after.journals, before.journals);
  } finally {
    await db.close();
  }
});
