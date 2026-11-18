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

test("optimized raster keeps every pixel and row while removing blank image data", () => {
  const width = 576,
    height = 1000;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y] of [
    [0, 100],
    [575, 101],
    [20, 350],
    [21, 350],
  ])
    pixels.set([0, 0, 0, 255], (y * width + x) * 4);
  const bytes = rasterCommands(width, height, pixels);
  assert.ok(
    bytes.length < 1000,
    `Sparse receipt should not send ${bytes.length} bytes`,
  );
  const reconstructed = new Set<string>();
  let y = 0;
  for (let i = 2; i < bytes.length;) {
    if (bytes[i] === 29 && bytes[i + 1] === 80) {
      i += 4;
      continue;
    }
    if (bytes[i] === 27 && bytes[i + 1] === 74) {
      y += bytes[i + 2];
      i += 3;
      continue;
    }
    if (bytes[i] === 29 && bytes[i + 1] === 118) {
      const rowBytes = bytes[i + 4] + 256 * bytes[i + 5],
        rows = bytes[i + 6] + 256 * bytes[i + 7];
      i += 8;
      for (let row = 0; row < rows; row++)
        for (let bx = 0; bx < rowBytes; bx++) {
          const bits = bytes[i++];
          for (let bit = 0; bit < 8; bit++)
            if (bits & (128 >> bit))
              reconstructed.add(`${bx * 8 + bit},${y + row}`);
        }
      y += rows;
      continue;
    }
    break;
  }
  assert.equal(y, height, "Blank-space feeds retain original receipt height");
  assert.deepEqual(
    [...reconstructed].sort(),
    ["0,100", "575,101", "20,350", "21,350"].sort(),
  );
  assert.deepEqual(Array.from(bytes.slice(-7)), [27, 100, 4, 29, 86, 66, 0]);
});

test("fast mode keeps rightmost amounts and prints at the same physical width", async () => {
  const { fastRasterCommands } = await import("../lib/thermal-printer");
  const width = 576,
    height = 128;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set([0, 0, 0, 255], (y * width + x) * 4);
  const normal = rasterCommands(width, height, pixels);
  const fast = fastRasterCommands(width, height, pixels);
  assert.deepEqual(
    Array.from(fast.slice(0, 10)),
    [27, 64, 29, 118, 48, 3, 36, 0, 64, 0],
  );
  assert.equal(
    fast[10 + 35],
    255,
    "Rightmost input pixels survive the reduction",
  );
  assert.ok(
    fast.length < normal.length * 0.3,
    "Fast payload must be less than 30% of the dense original",
  );
  const edge = new Uint8ClampedArray(width * 4).fill(255);
  edge.set([0, 0, 0, 255], 575 * 4);
  assert.equal(
    fastRasterCommands(width, 1, edge)[10 + 35],
    1,
    "Last decimal column is retained",
  );
});
