import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../lib/db";
import { exportData, importData } from "../lib/data-transfer";
import { readAttachment } from "../lib/attachments";
import { execute, snapshot } from "../lib/shop";
import { testDatabase } from "./support/test-db";

test("embedded data moves completely and numbering continues", async () => {
  const source = new PGlite();
  await migrate(source);
  let n = 0;
  const run = (db: PGlite | Awaited<ReturnType<typeof testDatabase>>) =>
    (action: string, data: Record<string, unknown>) =>
      execute(db, action, data, `transfer-${++n}`, "owner");
  const product = await run(source)("product", {
    name: "Generated code",
    category: "Pork",
    unit: "kg",
    retail: "200",
  });
  const supplier = await run(source)("party", { name: "S", kind: "supplier" });
  await run(source)("restock", {
    productId: product.id,
    partyId: supplier.id,
    locationId: "freezer",
    quantity: "10",
    cost: "100",
  });
  const first = await run(source)("sale", {
    locationId: "freezer",
    lines: [{ productId: product.id, quantity: "1.250", tier: "retail" }],
    tendered: "250",
  });
  const expense = await run(source)("expense", {
    amount: "10",
    category: "Supplies",
    payee: "Store",
    date: "2026-10-30",
  });
  await source.query(
    `INSERT INTO "user"(id,name,email) VALUES('u1','Owner','owner@example.test')`,
  );
  const bytes = Buffer.from("%PDF-1.4 transfer test");
  const id = randomUUID();
  const folder = await mkdtemp(path.join(tmpdir(), "carved-transfer-"));
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, id), bytes);
    await source.query(
      "INSERT INTO attachments(id,document_id,name,mime) VALUES($1,$2,$3,$4)",
      [id, expense.id, "receipt.pdf", "application/pdf"],
    );
    const before = await snapshot(source);
    // The JSON round trip is what a saved export file goes through.
    const data = JSON.parse(JSON.stringify(await exportData(source, folder)));
    await source.close();

    const target = await testDatabase();
    await importData(target, data);
    const after = JSON.parse(JSON.stringify(await snapshot(target)));
    const expected = JSON.parse(JSON.stringify(before));
    assert.deepEqual(after.report, expected.report);
    assert.deepEqual(after.stock, expected.stock);
    assert.deepEqual(after.documents, expected.documents);
    assert.deepEqual(after.movements, expected.movements);
    assert.deepEqual(after.settings, expected.settings);

    const stored = await target.query(
      "SELECT data FROM attachment_files WHERE id=$1",
      [id],
    );
    assert.deepEqual(
      Buffer.from((stored.rows[0] as { data: Uint8Array }).data),
      bytes,
    );

    const next = await run(target)("sale", {
      locationId: "freezer",
      lines: [{ productId: product.id, quantity: "1", tier: "retail" }],
      tendered: "200",
    });
    assert.ok(next.number > first.number);
    const generated = await run(target)("product", {
      name: "Second generated code",
      category: "Pork",
      unit: "kg",
      retail: "200",
    });
    assert.notEqual(generated.code, product.code);

    await assert.rejects(() => importData(target, data), /not empty/);
    await target.close();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("hosted attachment bytes are read from the database", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://not-used";
  const bytes = Buffer.from([0, 1, 2, 255]);
  const db = {
    query: async () => ({ rows: [{ data: bytes }] }),
    exec: async () => {},
  };
  try {
    assert.deepEqual(await readAttachment(db, "id"), bytes);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
