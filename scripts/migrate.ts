import "./env";
import { database, migrate } from "../lib/db";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL; the local database migrates at startup");
  const db = await database();
  await migrate(db);
  console.log("Migrations are up to date.");
  await db.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
