import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../lib/db";
import { openPostgres, type Database } from "../../lib/postgres";

// Every test starts empty, so the shared schema is dropped and rebuilt.
// Refusing other schema names keeps this from ever running against real data.
async function reset(db: Database) {
  const schema = (
    (await db.query("SELECT current_schema() AS name")).rows[0] as {
      name: string;
    }
  ).name;
  if (!/_test$/.test(schema))
    throw new Error(`Refusing to reset schema "${schema}"`);
  const objects = (
    await db.query(
      `SELECT 'TABLE' AS kind, tablename AS name FROM pg_tables WHERE schemaname=$1
       UNION ALL SELECT 'SEQUENCE', sequencename FROM pg_sequences WHERE schemaname=$1
       UNION ALL SELECT 'FUNCTION', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1`,
      [schema],
    )
  ).rows as { kind: string; name: string }[];
  for (const { kind, name } of objects)
    await db.exec(`DROP ${kind} IF EXISTS "${name}" CASCADE`);
}

export const usingPostgres = () => Boolean(process.env.TEST_DATABASE_URL);

export async function testDatabase(): Promise<Database> {
  if (!usingPostgres()) {
    const db = new PGlite();
    await migrate(db);
    return db;
  }
  const db = openPostgres(process.env.TEST_DATABASE_URL!);
  await reset(db);
  await migrate(db);
  return db;
}
