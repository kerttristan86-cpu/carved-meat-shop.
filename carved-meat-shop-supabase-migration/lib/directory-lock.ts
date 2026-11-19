import { open, readFile, unlink, stat } from "node:fs/promises";
import { unlinkSync, statSync } from "node:fs";
import path from "node:path";
export async function claimDirectory(directory: string) {
  const lock = path.resolve(directory) + ".process-lock";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lock, "wx");
      const identity = await handle.stat({ bigint: true });
      await handle.writeFile(String(process.pid));
      await handle.close();
      const cleanup = () => {
        try {
          const current = statSync(lock, { bigint: true });
          if (current.dev === identity.dev && current.ino === identity.ino)
            unlinkSync(lock);
        } catch {}
      };
      process.once("exit", cleanup);
      return async () => {
        process.removeListener("exit", cleanup);
        try {
          const current = await stat(lock, { bigint: true });
          if (current.dev === identity.dev && current.ino === identity.ino)
            await unlink(lock);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let stale = false;
      try {
        const pid = Number(await readFile(lock, "utf8"));
        if (!Number.isInteger(pid) || pid <= 0)
          throw new Error(
            "Database lock is incomplete; verify no running server before removing it",
          );
        try {
          process.kill(pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ESRCH") stale = true;
          else throw e;
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw e;
      }
      if (stale)
        throw new Error(
          "A stale database process lock exists. Verify no server owns this database, then manually remove its adjacent .process-lock file before restarting.",
        );
      throw new Error(
        "This database is already open in another process. Stop that server before setup, backup, or starting another instance.",
      );
    }
  }
  throw new Error("Could not acquire database process lock");
}
