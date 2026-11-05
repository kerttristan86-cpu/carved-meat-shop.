import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { database } from "./db";
import * as schema from "./auth-schema";
import { PostgresDatabase } from "./postgres";
async function orm() {
  const db = await database();
  if (db instanceof PostgresDatabase) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle(db.pool, { schema });
  }
  const { drizzle } = await import("drizzle-orm/pglite");
  return drizzle(db as never, { schema });
}
export async function authentication(bootstrap = false) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-"))
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters");
  return betterAuth({
    appName: "CARVED",
    secret,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    database: drizzleAdapter(await orm(), {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !bootstrap,
      minPasswordLength: 12,
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    rateLimit: { enabled: true, window: 60, max: 20 },
    advanced: {
      useSecureCookies: (process.env.BETTER_AUTH_URL || "").startsWith(
        "https://",
      ),
    },
  });
}
