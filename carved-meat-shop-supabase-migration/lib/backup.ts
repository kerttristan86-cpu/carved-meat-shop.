import { PGlite } from "@electric-sql/pglite";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export async function createBackup(db: PGlite, directory: string) {
  const archive = await db.dumpDataDir("gzip");
  const ids = (await db.query<{ id: string }>("SELECT id FROM attachments"))
    .rows;
  const attachments = [];
  for (const { id } of ids)
    attachments.push({
      id,
      data: (
        await readFile(path.resolve(directory, "attachments", id))
      ).toString("base64"),
    });
  return {
    format: "carved-v1",
    createdAt: new Date().toISOString(),
    database: Buffer.from(await archive.arrayBuffer()).toString("base64"),
    attachments,
  };
}
export async function restoreBackup(
  bundle: Awaited<ReturnType<typeof createBackup>>,
  target: string,
) {
  if (bundle.format !== "carved-v1")
    throw new Error("Unsupported backup format");
  let exists = false;
  try {
    await access(target);
    exists = true;
  } catch {}
  if (exists)
    throw new Error(
      "Restore target must not already exist; live data is never overwritten",
    );
  if (
    !Array.isArray(bundle.attachments) ||
    bundle.attachments.some((a) => !/^[-a-f0-9]{36}$/.test(a.id))
  )
    throw new Error("Invalid attachment manifest");
  await mkdir(path.dirname(path.resolve(target)), { recursive: true });
  const db = new PGlite({
    dataDir: target,
    loadDataDir: new Blob([Buffer.from(bundle.database, "base64")]),
  });
  await db.waitReady;
  try {
    if (bundle.attachments.length)
      await mkdir(path.resolve(target, "attachments"), { recursive: true });
    for (const a of bundle.attachments)
      await writeFile(
        path.resolve(target, "attachments", a.id),
        Buffer.from(a.data, "base64"),
      );
    const count = (await db.query("SELECT count(*) FROM documents")).rows;
    return count;
  } finally {
    await db.close();
  }
}
