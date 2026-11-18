import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { migrate } from "../lib/db";
import { createBackup, restoreBackup } from "../lib/backup";
import { execute } from "../lib/shop";
test("full restore includes private expense attachments and refuses existing target", async () => {
  const root = `./data/restore-test-${Date.now()}`,
    source = root + "/source",
    target = root + "/restored";
  const db = new PGlite();
  await migrate(db);
  const expense = await execute(
    db,
    "expense",
    { amount: "10", category: "Supplies", payee: "Store", date: "2026-10-30" },
    "backup-expense",
    "owner",
  );
  const id = randomUUID(),
    content = Buffer.from("%PDF-1.4 test expense document");
  await mkdir(source + "/attachments", { recursive: true });
  await writeFile(source + "/attachments/" + id, content);
  await db.query(
    "INSERT INTO attachments(id,document_id,name,mime) VALUES($1,$2,$3,$4)",
    [id, expense.id, "receipt.pdf", "application/pdf"],
  );
  const backup = await createBackup(db, source);
  await restoreBackup(backup, target);
  assert.deepEqual(await readFile(target + "/attachments/" + id), content);
  await assert.rejects(
    () => restoreBackup(backup, target),
    /must not already exist/,
  );
  await db.close();
});
