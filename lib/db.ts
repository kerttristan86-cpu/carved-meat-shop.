import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { claimDirectory } from "./directory-lock";
export async function migrate(db: PGlite) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const file of (await readdir(path.join(process.cwd(), "migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      (
        await db.query(
          "SELECT version FROM schema_migrations WHERE version=$1",
          [file],
        )
      ).rows.length
    )
      continue;
    const sql = await readFile(
      path.join(process.cwd(), "migrations", file),
      "utf8",
    );
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        file,
      ]);
    });
  }
}
const globalDb = globalThis as unknown as { carvedDb?: Promise<PGlite> };
export function database() {
  if (globalDb.carvedDb) return globalDb.carvedDb;
  const opening = (async () => {
    const directory = process.env.DATABASE_DIR || "./data/production";
    await mkdir(path.dirname(path.resolve(directory)), { recursive: true });
    const release = await claimDirectory(directory);
    let db: PGlite | undefined;
    try {
      db = new PGlite(directory);
      await migrate(db);
      return db;
    } catch (error) {
      // Never release ownership while a partially opened engine may still be active.
      if (db) await db.close();
      await release();
      throw error;
    }
  })();
  globalDb.carvedDb = opening;
  void opening.catch(() => {
    if (globalDb.carvedDb === opening) delete globalDb.carvedDb;
  });
  return opening;
}
