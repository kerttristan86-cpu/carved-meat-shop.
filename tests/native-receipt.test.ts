import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeReceipt,
  nativeColumns,
  printerText,
} from "../lib/native-receipt";
import { readPrintQuality } from "../lib/thermal-printer";

test("receipt printing defaults to sharper raster output but honors Fast preference", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let quality: string | null = null;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => quality },
  });
  try {
    assert.equal(readPrintQuality(), "sharp");
    quality = "fast";
    assert.equal(readPrintQuality(), "fast");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
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

test("fast logo keeps the artwork with under half the old Bluetooth image payload", async () => {
  const { nativeReceipt, rasterImage } = await import("../lib/native-receipt");
  let decodes = 0;
  const canvases: { width: number; height: number }[] = [];
  const img = {
    src: "test://compact-logo",
    naturalWidth: 144,
    naturalHeight: 144,
    async decode() {
      decodes++;
    },
  };
  const element = {
    querySelector: () => img,
    children: [
      {
        classList: { contains: (name: string) => name === "receipt-total" },
        firstElementChild: { textContent: "TOTAL", tagName: "STRONG" },
        lastElementChild: { textContent: "PHP 1,795.00" },
      },
    ],
  } as unknown as HTMLElement;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return {
              fillStyle: "",
              fillRect() {},
              drawImage() {},
              getImageData() {
                return {
                  data: new Uint8ClampedArray(
                    canvas.width * canvas.height * 4,
                  ).map((_, i) => (i % 4 === 3 ? 255 : 0)),
                };
              },
            };
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  try {
    const withLogo = await nativeReceipt(element, true);
    const withoutLogo = await nativeReceipt(element, false);
    const repeated = await nativeReceipt(element, true);
    assert.equal(canvases[0].width, 96);
    assert.equal(canvases[0].height, 96);
    const oldLogo = rasterImage(
      144,
      144,
      new Uint8ClampedArray(144 * 144 * 4).fill(255),
    );
    assert.ok(withLogo.length - withoutLogo.length < oldLogo.length / 2);
    const header = Array.from(withLogo).findIndex(
      (value, i, bytes) =>
        value === 29 && bytes[i + 1] === 118 && bytes[i + 2] === 48,
    );
    assert.deepEqual(
      Array.from(withLogo.slice(header, header + 8)),
      [29, 118, 48, 0, 12, 0, 96, 0],
    );
    assert.ok(
      withLogo
        .slice(header + 8, header + 8 + 1152)
        .every((value) => value === 255),
      "Black artwork remains in the logo bitmap",
    );
    assert.ok(new TextDecoder().decode(withLogo).includes("PHP 1,795.00"));
    assert.deepEqual(
      Array.from(withLogo.slice(-7)),
      [27, 100, 4, 29, 86, 66, 0],
    );
    assert.deepEqual(repeated, withLogo);
    assert.equal(decodes, 1);
    assert.equal(canvases.length, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
