import { readFile } from "node:fs/promises";
import path from "node:path";
import { readTransaction, type Database, type Queryable } from "./postgres";

// Parents come before the rows that reference them.
const TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "settings",
  "locations",
  "products",
  "parties",
  "stock",
  "valuation",
  "documents",
  "movements",
  "journals",
  "audit",
  "requests",
  "attachments",
  "attachment_files",
];
const SEEDED = ["settings", "locations"];
export const FORMAT = "carved-data-v1";
type Row = Record<string, unknown>;
export type DataExport = {
  format: typeof FORMAT;
  createdAt: string;
  migrations: string[];
  productCodeSequence: number;
  tables: Record<string, Row[]>;
};
const count = async (db: Queryable, table: string) =>
  Number(
    ((await db.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0] as Row).n,
  );
async function columnTypes(db: Queryable, table: string) {
  const { rows } = await db.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1",
    [table],
  );
  return Object.fromEntries(
    (rows as { column_name: string; data_type: string }[]).map((c) => [
      c.column_name,
      c.data_type,
    ]),
  );
}

async function assertKnownTables(db: Queryable) {
  const { rows } = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname=current_schema()",
  );
  const unknown = (rows as { tablename: string }[])
    .map((r) => r.tablename)
    .filter((t) => t !== "schema_migrations" && !TABLES.includes(t));
  if (unknown.length)
    throw new Error(`Add these tables to the transfer: ${unknown.join(", ")}`);
}

// With a directory, attachment bytes are read from local files into the export.
export async function exportData(
  db: Database,
  attachmentDirectory?: string,
): Promise<DataExport> {
  return readTransaction(db, async (tx) => {
    await assertKnownTables(tx);
    const tables: Record<string, Row[]> = {};
    for (const table of TABLES) {
      const types = await columnTypes(tx, table);
      const { rows } = await tx.query(`SELECT * FROM "${table}"`);
      tables[table] = (rows as Row[]).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            types[key] === "bytea"
              ? Buffer.from(value as Uint8Array).toString("base64")
              : value,
          ]),
        ),
      );
    }
    if (attachmentDirectory)
      for (const { id } of tables.attachments as { id: string }[])
        if (!tables.attachment_files.some((f) => f.id === id))
          tables.attachment_files.push({
            id,
            data: (await readFile(path.join(attachmentDirectory, id))).toString(
              "base64",
            ),
          });
    const { rows: sequence } = await tx.query(
      "SELECT last_value, is_called FROM product_code_sequence",
    );
    const { last_value, is_called } = sequence[0] as {
      last_value: number;
      is_called: boolean;
    };
    const { rows: migrations } = await tx.query(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    return {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      migrations: (migrations as { version: string }[]).map((m) => m.version),
      productCodeSequence: is_called ? Number(last_value) : 0,
      tables,
    };
  });
}

// Runs as one transaction, so a failed import leaves the target empty.
export async function importData(db: Database, data: DataExport) {
  if (data.format !== FORMAT) throw new Error("Unsupported data format");
  return db.transaction(async (tx) => {
    await assertKnownTables(tx);
    const { rows: applied } = await tx.query(
      "SELECT version FROM schema_migrations",
    );
    const versions = new Set(
      (applied as { version: string }[]).map((m) => m.version),
    );
    for (const version of data.migrations)
      if (!versions.has(version))
        throw new Error(`Run migrations first: ${version} is missing`);
    for (const table of TABLES)
      if (!SEEDED.includes(table) && (await count(tx, table)))
        throw new Error(
          `Target is not empty: ${table} has rows; existing data is never replaced`,
        );
    for (const table of SEEDED) await tx.query(`DELETE FROM "${table}"`);
    for (const table of TABLES) {
      const types = await columnTypes(tx, table);
      for (const row of data.tables[table] || []) {
        const keys = Object.keys(row);
        const values = keys.map((key) => {
          const value = row[key];
          if (value === null || value === undefined) return null;
          if (types[key] === "bytea")
            return Buffer.from(value as string, "base64");
          if (types[key] === "jsonb" || types[key] === "json")
            return JSON.stringify(value);
          return value;
        });
        const columns = keys.map((k) => `"${k}"`).join(",");
        const slots = keys.map((_, i) => `$${i + 1}`).join(",");
        await tx.query(
          `INSERT INTO "${table}"(${columns}) ${table === "documents" ? "OVERRIDING SYSTEM VALUE " : ""}VALUES(${slots})`,
          values,
        );
      }
    }
    // New sales and product codes continue after the imported numbers.
    await tx.query(
      "SELECT setval(pg_get_serial_sequence('documents','number'), GREATEST((SELECT COALESCE(MAX(number),0) FROM documents),1), (SELECT COUNT(*)>0 FROM documents))",
    );
    await tx.query(
      "SELECT setval('product_code_sequence', GREATEST($1::bigint,1), $1::bigint>0)",
      [data.productCodeSequence],
    );
    return Object.fromEntries(
      TABLES.map((t) => [t, (data.tables[t] || []).length]),
    );
  });
}
