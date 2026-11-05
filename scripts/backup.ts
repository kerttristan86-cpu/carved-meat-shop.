import "./env";
import type { PGlite } from "@electric-sql/pglite";
import { database } from "../lib/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBackup } from "../lib/backup";
import { exportData } from "../lib/data-transfer";
// `--transfer` exports a local database in the format a hosted database imports.
async function main() {
  const db = await database();
  const directory = process.env.DATABASE_DIR || "./data/production";
  const dump = process.env.DATABASE_URL
    ? await exportData(db)
    : process.argv.includes("--transfer")
      ? await exportData(db, path.resolve(directory, "attachments"))
      : await createBackup(db as unknown as PGlite, directory);
  await mkdir("backups", { recursive: true });
  const file = `backups/carved-${Date.now()}.carved-backup.json`;
  await writeFile(file, JSON.stringify(dump));
  console.log(file);
  await db.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
