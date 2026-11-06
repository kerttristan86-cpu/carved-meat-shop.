import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeReceipt,
  nativeColumns,
  printerText,
} from "../lib/native-receipt";

test("native receipts keep full decimal amounts and wrap long labels within the print width", () => {
  const rows = nativeColumns(
    "Cash tendered with a very long label",
    "PHP 1,234,567.89",
  );
  assert.ok(rows.every((row) => row.length <= 42));
  assert.ok(rows.join("\n").includes("PHP 1,234,567.89"));
  assert.equal(rows[rows.length - 1].slice(-16), "PHP 1,234,567.89");
  assert.equal(
    printerText("₱480.00 × 1.000 kg · RETAIL\x1b@"),
    "PHP 480.00 x 1.000 kg - RETAIL@",
  );
});
test("native printing uses real text, normal spacing, emphasized totals and one final cut", () => {
  const bytes = buildNativeReceipt([
    { kind: "text", text: "CARVED Meat Shop", center: true, bold: true },
    { kind: "rule" },
    { kind: "text", text: "Beef brisket", bold: true },
    { kind: "row", left: "1.000 kg × ₱480.00 RETAIL", right: "₱480.00" },
    { kind: "row", left: "TOTAL", right: "₱480.00", bold: true },
    { kind: "row", left: "Change", right: "₱20.00" },
  ]);
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("Beef brisket"));
  assert.ok(text.includes("PHP 480.00"));
  assert.ok(bytes.length < 700);
  assert.ok(
    text.includes("\x1b2"),
    "Default readable line spacing is set explicitly",
  );
  assert.ok(!text.includes("\x1d\x76\x30"), "Text-only body is not a bitmap");
  assert.deepEqual(Array.from(bytes.slice(-7)), [27, 100, 4, 29, 86, 66, 0]);
});

test("image fallback retains blank rows and never uses scaled or dot-feed shortcuts", async () => {
  const { imageReceipt } = await import("../lib/native-receipt");
  const pixels = new Uint8ClampedArray(16 * 3 * 4).fill(255);
  pixels.set([0, 0, 0, 255], (2 * 16 + 15) * 4);
  const bytes = imageReceipt(16, 3, pixels);
  assert.deepEqual(
    Array.from(bytes),
    [
      27, 64, 29, 118, 48, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 1, 27, 100, 4, 29, 86,
      66, 0,
    ],
  );
});
