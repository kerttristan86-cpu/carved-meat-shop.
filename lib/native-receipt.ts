export type ReceiptBlock =
  | { kind: "text"; text: string; center?: boolean; bold?: boolean }
  | { kind: "row"; left: string; right: string; bold?: boolean }
  | { kind: "rule" };
const COLUMNS = 42;
export function printerText(value: string): string {
  return String(value)
    .replace(/₱/g, "PHP ")
    .replace(/×/g, "x")
    .replace(/[·–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}
function wrap(value: string, width = COLUMNS): string[] {
  let rest = printerText(value).replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 1) cut = width;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) lines.push(rest);
  return lines.length ? lines : [""];
}
export function nativeColumns(left: string, right: string): string[] {
  const amount = printerText(right).trim(),
    available = COLUMNS - amount.length - 1;
  if (amount.length > COLUMNS)
    throw new Error("Amount is too wide for the receipt. Use System print.");
  if (available < 12) return [...wrap(left), amount.padStart(COLUMNS)];
  const labels = wrap(left, available),
    last = labels.pop() || "";
  return [
    ...labels,
    last + " ".repeat(COLUMNS - last.length - amount.length) + amount,
  ];
}
/** Normal raster bands only. White rows remain pixels: no optional feed-unit commands. */
export function rasterImage(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 576 ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 20000 ||
    rgba.length !== width * height * 4
  )
    throw new Error("Invalid receipt image dimensions.");
  const rowBytes = Math.ceil(width / 8),
    parts: number[] = [];
  for (let top = 0; top < height; top += 128) {
    const rows = Math.min(128, height - top);
    parts.push(
      29,
      118,
      48,
      0,
      rowBytes & 255,
      rowBytes >> 8,
      rows & 255,
      rows >> 8,
    );
    for (let y = top; y < top + rows; y++)
      for (let bx = 0; bx < rowBytes; bx++) {
        let bits = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= width) continue;
          const i = (y * width + x) * 4,
            a = rgba[i + 3] / 255;
          const light =
            (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a +
            255 * (1 - a);
          if (light < 160) bits |= 128 >> bit;
        }
        parts.push(bits);
      }
  }
  return Uint8Array.from(parts);
}
export function buildNativeReceipt(
  blocks: ReceiptBlock[],
  logo?: Uint8Array,
): Uint8Array {
  // Reset, Font A, normal character size, 30-dot default line spacing, safe margins.
  const output: number[] = [
    27, 64, 27, 77, 0, 27, 33, 0, 29, 33, 0, 27, 50, 29, 76, 24, 0, 29, 87, 16,
    2,
  ];
  const encoder = new TextEncoder();
  const text = (value: string) => {
    output.push(...encoder.encode(value + "\n"));
  };
  if (logo) {
    output.push(27, 97, 1, ...logo, 10);
  }
  for (const block of blocks) {
    output.push(
      27,
      97,
      block.kind === "text" && block.center ? 1 : 0,
      27,
      69,
      block.kind !== "rule" && block.bold ? 1 : 0,
    );
    if (block.kind === "rule") text("-".repeat(COLUMNS));
    else if (block.kind === "row")
      nativeColumns(block.left, block.right).forEach(text);
    else wrap(block.text).forEach(text);
  }
  output.push(27, 69, 0, 27, 100, 4, 29, 86, 66, 0);
  return Uint8Array.from(output);
}
export function receiptBlocks(element: HTMLElement): ReceiptBlock[] {
  const blocks: ReceiptBlock[] = [];
  const content = (el: Element | null) =>
    el?.textContent?.replace(/\s+/g, " ").trim() || "";
  for (const child of Array.from(element.children)) {
    if (child.tagName === "IMG") continue;
    if (child.tagName === "HR") {
      blocks.push({ kind: "rule" });
      continue;
    }
    if (child.classList.contains("receipt-line")) {
      blocks.push({
        kind: "text",
        text: content(child.querySelector(":scope > strong")),
        bold: true,
      });
      const row = child.querySelector(":scope > div");
      if (row)
        blocks.push({
          kind: "row",
          left: content(row.firstElementChild),
          right: content(row.lastElementChild),
        });
      continue;
    }
    if (child.classList.contains("receipt-total")) {
      blocks.push({
        kind: "row",
        left: content(child.firstElementChild),
        right: content(child.lastElementChild),
        bold: child.firstElementChild?.tagName === "STRONG",
      });
      continue;
    }
    const clone = child.cloneNode(true) as Element;
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    for (const line of (clone.textContent || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean))
      blocks.push({
        kind: "text",
        text: line,
        center: true,
        bold: child.tagName === "H3" || child.tagName === "H4",
      });
  }
  return blocks;
}
let logoSource = "",
  logoBytes: Uint8Array | undefined;
export async function nativeReceipt(
  element: HTMLElement,
  includeLogo = true,
): Promise<Uint8Array> {
  const img = element.querySelector("img");
  let logo: Uint8Array | undefined;
  if (includeLogo && img) {
    if (logoBytes && logoSource === img.src) logo = logoBytes;
    else {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = Math.max(
        1,
        Math.round((canvas.width * img.naturalHeight) / img.naturalWidth),
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Cannot prepare receipt logo.");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      logo = rasterImage(
        canvas.width,
        canvas.height,
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      logoSource = img.src;
      logoBytes = logo;
    }
  }
  return buildNativeReceipt(receiptBlocks(element), logo);
}
export function imageReceipt(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
) {
  const bitmap = rasterImage(width, height, rgba),
    out = new Uint8Array(bitmap.length + 9);
  out.set([27, 64]);
  out.set(bitmap, 2);
  out.set([27, 100, 4, 29, 86, 66, 0], bitmap.length + 2);
  return out;
}
