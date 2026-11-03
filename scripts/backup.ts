import "./env";
import { database } from "../lib/db";
import { mkdir, writeFile } from "node:fs/promises";
import { createBackup } from "../lib/backup";
async function main() {
  const db = await database();
  const dump = await createBackup(
    db,
    process.env.DATABASE_DIR || "./data/production",
  );
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
