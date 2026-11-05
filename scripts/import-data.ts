import "./env";
import { readFile } from "node:fs/promises";
import { database } from "../lib/db";
import { importData } from "../lib/data-transfer";
async function main() {
  const [source] = process.argv.slice(2);
  if (!source) throw new Error("Usage: npm run import-data -- backup.json");
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL; imports only target a hosted database");
  const db = await database();
  const imported = await importData(db, JSON.parse(await readFile(source, "utf8")));
  console.log("Imported rows:", imported);
  await db.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
