import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../lib/db";
import { execute, snapshot } from "../lib/shop";
test("blank product codes generate unique codes, avoid manual codes and survive edits and retries", async () => {
  const db = new PGlite();
  await migrate(db);
  let n = 0;
  const run = (d: any, key?: string) =>
    execute(db, "product", d, key || "product-" + ++n, "owner");
  const base = { name: "Pork", category: "Pork", unit: "kg", retail: "239" };
  await run({ ...base, code: "P000001" });
  const a = await run(base, "automatic");
  assert.equal(a.code, "P000002");
  assert.equal((await run(base, "automatic")).code, a.code);
  const b = await run({ ...base, code: "  " });
  assert.equal(b.code, "P000003");
  const edit = await run({ ...base, id: a.id, code: "" });
  assert.equal(edit.code, a.code);
  const manual = await run({ ...base, code: "CUSTOM-123" });
  assert.equal(manual.code, "CUSTOM-123");
  const [c, d] = await Promise.all([run(base), run(base)]);
  assert.notEqual(c.code, d.code);
  const state = await snapshot(db);
  assert.equal(
    new Set(state.products.map((p) => p.code)).size,
    state.products.length,
  );
  await db.close();
});
