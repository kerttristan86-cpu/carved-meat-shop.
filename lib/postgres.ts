import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, types } from "pg";

export type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  exec(sql: string): Promise<unknown>;
};
export type Database = Queryable & {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
  // A consistent read-only view that cannot conflict with concurrent writes.
  readTransaction?<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export function readTransaction<T>(
  db: Database,
  run: (tx: Queryable) => Promise<T>,
) {
  return db.readTransaction ? db.readTransaction(run) : db.transaction(run);
}

const ATTEMPTS = 10;
// Matches PGlite, so money and quantity columns stay numbers in both engines.
const parseBigint = (value: string) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : BigInt(value);
};
const typeParsers = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === types.builtins.INT8 && format !== "binary") return parseBigint;
    return types.getTypeParser(oid, format as "text");
  },
};
type PostgresError = Error & { code?: string; constraint?: string };
// Rolled back conflicts are safe to rerun. A concurrent retry of the same
// request key reruns too, and then finds the saved result of the first attempt.
function retryable(error: PostgresError) {
  return (
    error.code === "40001" ||
    error.code === "40P01" ||
    (error.code === "23505" && error.constraint === "requests_pkey")
  );
}

export class PostgresDatabase implements Database {
  constructor(readonly pool: Pool) {}
  async query(sql: string, params: unknown[] = []) {
    return { rows: (await this.pool.query(sql, params as never[])).rows };
  }
  async exec(sql: string) {
    await this.pool.query(sql);
  }
  transaction<T>(run: (tx: Queryable) => Promise<T>) {
    return this.attempt("BEGIN ISOLATION LEVEL SERIALIZABLE", run);
  }
  readTransaction<T>(run: (tx: Queryable) => Promise<T>) {
    return this.attempt("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", run);
  }
  close() {
    return this.pool.end();
  }
  private async attempt<T>(begin: string, run: (tx: Queryable) => Promise<T>) {
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      let failure: PostgresError;
      let broken = false;
      try {
        await client.query(begin);
        const result = await run({
          query: async (sql, params = []) => ({
            rows: (await client.query(sql, params as never[])).rows,
          }),
          exec: (sql) => client.query(sql),
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        failure = error as PostgresError;
        try {
          await client.query("ROLLBACK");
        } catch {
          broken = true;
        }
      } finally {
        client.release(broken);
      }
      if (!retryable(failure)) throw failure;
      if (attempt >= ATTEMPTS)
        throw new Error(
          "The shop is busy saving another transaction. Nothing was saved; please try again.",
        );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 40 * 2 ** Math.min(attempt, 6)),
      );
    }
  }
}

function certificate() {
  if (process.env.DATABASE_CA_PEM)
    return process.env.DATABASE_CA_PEM.replace(/\\n/g, "\n");
  if (process.env.DATABASE_CA_FILE)
    return readFileSync(path.resolve(process.env.DATABASE_CA_FILE), "utf8");
  throw new Error(
    "Set DATABASE_CA_PEM or DATABASE_CA_FILE; the database connection must be verified",
  );
}

export function openPostgres(connectionString: string) {
  const pool = new Pool({
    connectionString,
    ssl: { ca: certificate(), rejectUnauthorized: true },
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    application_name: "carved",
    types: typeParsers,
  });
  // An idle connection dropped by the pooler must not crash the process.
  pool.on("error", () => {});
  return new PostgresDatabase(pool);
}
