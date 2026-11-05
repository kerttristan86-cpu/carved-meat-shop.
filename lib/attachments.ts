import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Queryable } from "./postgres";

// Hosted requests are limited to 4.5 MB, so the hosted limit leaves room for the form.
export const attachmentLimit = () =>
  process.env.DATABASE_URL ? 4000000 : 5000000;
const hosted = () => Boolean(process.env.DATABASE_URL);
const directory = () =>
  path.resolve(process.env.DATABASE_DIR || "./data/production", "attachments");

// Local bytes are written first; the attachment row is what makes them visible.
export async function prepareAttachment(id: string, data: Buffer) {
  if (hosted()) return;
  await mkdir(directory(), { recursive: true });
  await writeFile(path.join(directory(), id), data, { flag: "wx" });
}
export async function storeAttachment(tx: Queryable, id: string, data: Buffer) {
  if (hosted())
    await tx.query("INSERT INTO attachment_files(id,data) VALUES($1,$2)", [
      id,
      data,
    ]);
}
export async function readAttachment(db: Queryable, id: string) {
  if (!hosted()) return readFile(path.join(directory(), id));
  const row = (
    await db.query("SELECT data FROM attachment_files WHERE id=$1", [id])
  ).rows[0] as { data: Buffer } | undefined;
  if (!row) throw new Error("Attachment bytes not found");
  return row.data;
}
