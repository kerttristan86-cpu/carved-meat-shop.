import { readFile } from "node:fs/promises";
import { restoreBackup } from "../lib/backup";
async function main() {
  const [source, target] = process.argv.slice(2);
  if (!source || !target)
    throw new Error(
      "Usage: npm run restore -- backup.carved-backup.json ./data/restored-new",
    );
  const count = await restoreBackup(
    JSON.parse(await readFile(source, "utf8")),
    target,
  );
  console.log("Restored document count:", count);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
