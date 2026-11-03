import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/pglite";
import { database } from "./db";
import * as schema from "./auth-schema";
export async function authentication(bootstrap = false) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-"))
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters");
  return betterAuth({
    appName: "CARVED",
    secret,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    database: drizzleAdapter(drizzle(await database(), { schema }), {
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
