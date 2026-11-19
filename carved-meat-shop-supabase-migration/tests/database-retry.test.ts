import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir, access } from "node:fs/promises";
import path from "node:path";
import { database } from "../lib/db";
import { claimDirectory } from "../lib/directory-lock";

test("database initialization retries after a blocking lock is removed", async () => {
  const root = await mkdtemp(path.join(process.cwd(), "data", "audit-retry-"));
  const previous = process.env.DATABASE_DIR;
  process.env.DATABASE_DIR = path.join(root, "db");
  const lock = process.env.DATABASE_DIR + ".process-lock";
  await writeFile(lock, String(process.pid));
  try {
    await assert.rejects(database(), /already open/);
    await unlink(lock);
    const db = await database();
    assert.equal(
      (await db.query("SELECT count(*) AS count FROM schema_migrations")).rows
        .length,
      1,
    );
    await db.close();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_DIR;
    else process.env.DATABASE_DIR = previous;
    delete (globalThis as { carvedDb?: unknown }).carvedDb;
  }
});

test("directory claim returns an own-lock release and permits a fresh claim", async () => {
  const root = await mkdtemp(path.join(process.cwd(), "data", "audit-lock-"));
  const target = path.join(root, "db");
  const release = await claimDirectory(target);
  try {
    assert.equal(typeof release, "function");
    await assert.rejects(claimDirectory(target), /already open/);
    await release();
    await assert.rejects(access(target + ".process-lock"));
    const releaseAgain = await claimDirectory(target);
    await releaseAgain();
  } finally {
    await rmdir(root);
  }
});

test("failed migrations release the acquired lock and retry the same database safely", async () => {
  const originalCwd = process.cwd(),
    root = await mkdtemp(path.join(originalCwd, "data", "audit-migration-"));
  const previous = process.env.DATABASE_DIR;
  process.env.DATABASE_DIR = path.join(root, "db");
  try {
    process.chdir(root);
    await assert.rejects(database(), /ENOENT/);
    await assert.rejects(access(process.env.DATABASE_DIR + ".process-lock"));
    process.chdir(originalCwd);
    const db = await database();
    assert.ok(
      (await db.query("SELECT version FROM schema_migrations")).rows.length > 0,
    );
    await db.close();
  } finally {
    process.chdir(originalCwd);
    if (previous === undefined) delete process.env.DATABASE_DIR;
    else process.env.DATABASE_DIR = previous;
    delete (globalThis as { carvedDb?: unknown }).carvedDb;
  }
});

test("releasing an old claim does not remove a replacement lock", async () => {
  const root = await mkdtemp(
      path.join(process.cwd(), "data", "audit-replaced-lock-"),
    ),
    target = path.join(root, "db"),
    lock = target + ".process-lock";
  const release = await claimDirectory(target);
  await unlink(lock);
  await writeFile(lock, "another-owner");
  await release();
  await access(lock);
  await unlink(lock);
  await rmdir(root);
});
