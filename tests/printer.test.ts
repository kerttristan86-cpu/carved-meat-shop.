import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimAutoPrint,
  rasterCommands,
  sendChunks,
} from "../lib/thermal-printer";

test("a sale can only be printed automatically once", () => {
  assert.equal(claimAutoPrint("sale-1"), true);
  assert.equal(claimAutoPrint("sale-1"), false);
  assert.equal(claimAutoPrint("sale-2"), true);
});

test("thermal raster preserves the last pixel and pads partial bytes white", () => {
  const pixels = new Uint8ClampedArray(9 * 4).fill(255);
  pixels.set([0, 0, 0, 255], 8 * 4);
  const result = rasterCommands(9, 1, pixels);
  // Reset, raster header (two bytes wide), then both data bytes.
  assert.deepEqual(
    Array.from(result.slice(0, 12)),
    [27, 64, 29, 118, 48, 0, 2, 0, 1, 0, 0, 128],
  );
});

test("Bluetooth writes small ordered chunks and stops after an uncertain failure", async () => {
  const writes: number[][] = [];
  await sendChunks(
    new Uint8Array(45).map((_, i) => i),
    async (b) => {
      writes.push(Array.from(b));
    },
  );
  assert.deepEqual(
    writes.map((x) => x.length),
    [20, 20, 5],
  );
  assert.deepEqual(
    writes.flat(),
    Array.from({ length: 45 }, (_, i) => i),
  );
  let attempts = 0;
  await assert.rejects(
    sendChunks(new Uint8Array(60), async () => {
      if (++attempts === 2) throw new Error("disconnected");
    }),
    /may be partial/,
  );
  assert.equal(attempts, 2);
});
