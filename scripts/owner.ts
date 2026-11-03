import "./env";
import { authentication } from "../lib/auth";
import { database } from "../lib/db";
async function main() {
  const db = await database();
  if ((await db.query('SELECT id FROM "user" LIMIT 1')).rows.length)
    throw new Error(
      "Owner already exists; public registration remains disabled",
    );
  const email = process.env.OWNER_EMAIL,
    password = process.env.OWNER_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Set OWNER_EMAIL and OWNER_PASSWORD in your terminal (minimum 12 characters). Do not commit credentials.",
    );
  await (
    await authentication(true)
  ).api.signUpEmail({ body: { email, password, name: "Shop owner" } });
  console.log("Owner created. Registration is disabled in the application.");
  await db.close();
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
