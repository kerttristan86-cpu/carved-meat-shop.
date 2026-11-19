import { nativeReceipt, imageReceipt } from "./native-receipt";
// ESC/POS monochrome raster. Rasterizing the existing preview preserves the logo,
// peso symbol, decimal amounts and layout without relying on printer code pages.
export function rasterCommands(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  pixelScale: 1 | 2 = 1,
): Uint8Array {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width * pixelScale > 576 ||
    (pixelScale !== 1 && pixelScale !== 2) ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 20000 ||
    rgba.length !== width * height * 4
  )
    throw new Error("Receipt image dimensions are invalid or too large.");
  const rowBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(rowBytes * height);
  const used = new Uint16Array(height);
  // Keep the same threshold and dots, but do not transmit white paper as pixels.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        alpha = rgba[i + 3] / 255;
      const light =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha +
        255 * (1 - alpha);
      if (light < 180) {
        const bx = x >> 3;
        bitmap[y * rowBytes + bx] |= 128 >> (x & 7);
        used[y] = bx + 1;
      }
    }
  }
  const parts: number[] = [27, 64];
  let motionUnitsSet = false;
  for (let top = 0; top < height;) {
    if (!used[top]) {
      let end = top + 1;
      while (end < height && !used[end]) end++;
      // ESC J advances white rows without sending a full-width bitmap.
      // Set 203-dot motion units explicitly so spacing matches the raster.
      if (!motionUnitsSet) {
        parts.push(29, 80, 203, 203);
        motionUnitsSet = true;
      }
      for (let remaining = (end - top) * pixelScale; remaining > 0;) {
        const dots = Math.min(255, remaining);
        parts.push(27, 74, dots);
        remaining -= dots;
      }
      top = end;
      continue;
    }
    let end = top + 1,
      bandWidth = used[top];
    while (end < height && used[end] && end - top < 128) {
      bandWidth = Math.max(bandWidth, used[end]);
      end++;
    }
    const rows = end - top;
    // Trim white bytes on the right only: left alignment and decimals stay exact.
    parts.push(
      29,
      118,
      48,
      pixelScale === 2 ? 3 : 0,
      bandWidth & 255,
      bandWidth >> 8,
      rows & 255,
      rows >> 8,
    );
    for (let y = top; y < end; y++) {
      for (let x = 0; x < bandWidth; x++) parts.push(bitmap[y * rowBytes + x]);
    }
    top = end;
  }
  parts.push(27, 100, 4, 29, 86, 66, 0);
  return Uint8Array.from(parts);
}

/** Half-size raster expanded by the printer to the original paper size.
 * Max-pooling keeps thin strokes and rightmost decimals; edges are coarser.
 * It cuts the dense bitmap payload by 75% without overrunning printer buffers.
 */
export function fastRasterCommands(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
) {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 576 ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 20000 ||
    rgba.length !== width * height * 4
  )
    throw new Error("Receipt image dimensions are invalid or too large.");
  const w = Math.ceil(width / 2),
    h = Math.ceil(height / 2);
  const pixels = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        alpha = rgba[i + 3] / 255;
      const light =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha +
        255 * (1 - alpha);
      if (light < 180) {
        const target = (Math.floor(y / 2) * w + Math.floor(x / 2)) * 4;
        pixels[target] = pixels[target + 1] = pixels[target + 2] = 0;
      }
    }
  return rasterCommands(w, h, pixels, 2);
}
export function readPrintQuality(): "fast" | "sharp" {
  try {
    return localStorage.getItem("carved-print-quality") === "fast"
      ? "fast"
      : "sharp";
  } catch {
    return "sharp";
  }
}

export async function sendChunks(
  bytes: Uint8Array,
  write: (chunk: Uint8Array) => Promise<void>,
  size = 20,
  pauseMs = 5,
) {
  try {
    for (let i = 0; i < bytes.length; i += size) {
      await write(bytes.slice(i, i + size));
      if (pauseMs > 0 && i + size < bytes.length)
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  } catch {
    // Never retry automatically: bytes may already have printed.
    throw new Error(
      "Printer connection failed. The receipt may be partial. Check the paper before reprinting; the saved sale is safe.",
    );
  }
}

export async function receiptCanvas(element: HTMLElement) {
  await document.fonts.ready;
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map((img) => img.decode()),
  );
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 576 / element.getBoundingClientRect().width,
    logging: false,
    onclone: (doc) => {
      const receipt = doc.getElementById(element.id);
      if (receipt) {
        receipt.style.boxShadow = "none";
        // html2canvas does not support grid. Flex preserves the same two columns.
        receipt
          .querySelectorAll<HTMLElement>(".receipt-line > div, .receipt-total")
          .forEach((row) => {
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            Array.from(row.children).forEach((child, i) => {
              (child as HTMLElement).style.flex =
                i === 0 ? "1 1 0" : "0 0 auto";
              (child as HTMLElement).style.minWidth = "0";
            });
          });
      }
    },
  });
  // html2canvas rounds CSS bounds before applying scale and can produce 577px.
  // Normalize explicitly so the last amount column stays within 576 printer dots.
  const output = document.createElement("canvas");
  output.width = 576;
  output.height = Math.ceil((canvas.height * 576) / canvas.width);
  const context = output.getContext("2d");
  if (!context) throw new Error("Cannot render receipt image.");
  context.fillStyle = "white";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}

// These are known printer UART profiles, not a universal Bluetooth standard.
const profiles = [
  [
    "000018f0-0000-1000-8000-00805f9b34fb",
    "00002af1-0000-1000-8000-00805f9b34fb",
  ],
  [
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "49535343-8841-43f4-a8d4-ecbe34729bb3",
  ],
  [
    "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  ],
];
type Characteristic = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse(data: Uint8Array): Promise<void>;
  writeValueWithoutResponse(data: Uint8Array): Promise<void>;
};
type Device = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{
      getPrimaryService(
        id: string,
      ): Promise<{ getCharacteristic(id: string): Promise<Characteristic> }>;
    }>;
    disconnect(): void;
  };
};
let device: Device | undefined;
let characteristic: Characteristic | undefined;
let printing = false;

export function bluetoothSupport(): string | null {
  if (!window.isSecureContext)
    return "Bluetooth printing needs HTTPS. Open CARVED using its secure HTTPS address on the tablet.";
  if (!(navigator as any).bluetooth)
    return "This browser cannot connect directly to Bluetooth printers. Use Android Chrome for BLE, or System print / Save receipt image with a compatible print service or app on iPhone/iPad.";
  return null;
}
export function bluetoothPrinterName() {
  if (serialPort) return SERIAL_NAME;
  return device?.gatt?.connected && characteristic
    ? device.name || "Bluetooth printer"
    : "";
}

export type PrinterConnection = {
  state: "connected" | "disconnected" | "selected" | "unsupported" | "unknown";
  name: string;
};
/** A read-only view of the current local transport. Never pairs or reconnects. */
export function printerConnectionStatus(): PrinterConnection {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return { state: "unknown", name: "" };
  if (serialPort)
    return {
      state: serialPort.writable ? "connected" : "selected",
      name: SERIAL_NAME,
    };
  if (device?.gatt?.connected && characteristic)
    return { state: "connected", name: device.name || "Bluetooth printer" };
  return {
    state: !usesSerial() && bluetoothSupport() ? "unsupported" : "disconnected",
    name: "",
  };
}

// Windows and other desktops: the printer's Bluetooth serial (COM) link. It stays
// remembered across reloads, and is only held open while a receipt is sending so
// other programs can still use the printer.
const SERIAL_NAME = "Receipt printer";
type SerialPort = {
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  forget?(): Promise<void>;
};
let serialPort: SerialPort | undefined;
const SERIAL_CHUNK_BYTES = 128;
const SERIAL_CHUNK_PAUSE_MS = 20;
const SERIAL_LINK_SETTLE_MS = 500;
const SERIAL_DRAIN_MS = 2500;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function usesSerial() {
  return "serial" in navigator && !/android/i.test(navigator.userAgent);
}
async function sendSerial(port: SerialPort, data: Uint8Array) {
  try {
    await port.open({ baudRate: 9600 });
  } catch {
    throw new Error(
      "Can't reach the printer. Check that it is on and paired, then tap Print receipt. The saved sale is safe.",
    );
  }
  try {
    const writer = port.writable!.getWriter();
    try {
      // This link has no flow control: faster sends overrun the printer, which
      // then reads the rest of the image as text and misses the cut command.
      await wait(SERIAL_LINK_SETTLE_MS);
      await sendChunks(
        data,
        (chunk) => writer.write(chunk),
        SERIAL_CHUNK_BYTES,
        SERIAL_CHUNK_PAUSE_MS,
      );
      // Closing too early can drop the last bytes, including the cut.
      await wait(SERIAL_DRAIN_MS);
      await writer.close();
    } finally {
      writer.releaseLock();
    }
  } finally {
    await port.close().catch(() => {});
  }
}

export async function connectBluetoothPrinter(): Promise<string> {
  if (usesSerial()) {
    if (printing)
      throw new Error("Wait for the current receipt to finish sending.");
    // Called directly from a tap: requestPort requires user activation.
    const chosen: SerialPort = await (navigator as any).serial.requestPort({
      allowedBluetoothServiceClassIds: ["00001101-0000-1000-8000-00805f9b34fb"],
    });
    if (serialPort && serialPort !== chosen)
      await serialPort.forget?.().catch(() => {});
    serialPort = chosen;
    return SERIAL_NAME;
  }
  const unavailable = bluetoothSupport();
  if (unavailable) throw new Error(unavailable);
  if (printing)
    throw new Error("Wait for the current receipt to finish sending.");
  // Called directly from a tap: requestDevice requires user activation.
  const selected: Device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: profiles.map(([service]) => service),
  });
  device?.gatt?.disconnect();
  device = undefined;
  characteristic = undefined;
  try {
    return await attach(selected);
  } catch {
    selected.gatt?.disconnect();
    throw new Error(
      "This device does not expose a supported BLE printer profile. Bluetooth Classic/USB printers need a print service or native bridge. Use System print instead.",
    );
  }
}
async function attach(selected: Device): Promise<string> {
  const server = await selected.gatt?.connect();
  if (!server) throw new Error("No BLE connection");
  for (const [serviceId, characteristicId] of profiles) {
    try {
      const service = await server.getPrimaryService(serviceId);
      const candidate = await service.getCharacteristic(characteristicId);
      if (
        candidate.properties.write ||
        candidate.properties.writeWithoutResponse
      ) {
        device = selected;
        characteristic = candidate;
        const name = selected.name || "Bluetooth printer";
        try {
          localStorage.setItem(REMEMBERED_PRINTER, name);
        } catch {
          /* remembering the printer is only a convenience */
        }
        return name;
      }
    } catch {
      /* try the next known printer profile */
    }
  }
  throw new Error("Printer UART profile not found");
}
const REMEMBERED_PRINTER = "carved-bluetooth-printer";
/**
 * Silently reconnects to the printer chosen earlier, without opening the chooser.
 * Resolves to "" when that isn't possible; Chrome may still require a tap.
 */
export async function restoreBluetoothPrinter(): Promise<string> {
  const current = bluetoothPrinterName();
  if (current || printing) return current;
  if (usesSerial()) {
    try {
      const ports: SerialPort[] = await (navigator as any).serial.getPorts();
      serialPort = ports[ports.length - 1];
    } catch {
      serialPort = undefined;
    }
    return serialPort ? SERIAL_NAME : "";
  }
  const bluetooth = (navigator as any).bluetooth;
  try {
    let known = device;
    if (!known && bluetooth?.getDevices) {
      const remembered = localStorage.getItem(REMEMBERED_PRINTER);
      const permitted: Device[] = await bluetooth.getDevices();
      known = permitted.find((d) => d.name && d.name === remembered);
    }
    if (!known) return "";
    const target = known;
    return await Promise.race([
      attach(target),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve(""), RESTORE_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return "";
  }
}
const RESTORE_TIMEOUT_MS = 5000;

// One automatic print per sale. Claimed before sending and never retried,
// because a failed transfer may already have put paper out.
const autoPrinted = new Set<string>();
export function claimAutoPrint(saleId: string) {
  if (autoPrinted.has(saleId)) return false;
  autoPrinted.add(saleId);
  return true;
}
export async function printBluetoothReceipt(element: HTMLElement) {
  if (printing) throw new Error("A receipt is already being sent.");
  const port = serialPort;
  const target = characteristic;
  if (!port && (!target || !device?.gatt?.connected))
    throw new Error("Printer disconnected. Tap Connect printer again.");
  printing = true;
  try {
    let data: Uint8Array;
    const native = readPrintQuality() !== "sharp";
    if (native) {
      let includeLogo = true;
      try {
        includeLogo = localStorage.getItem("carved-print-logo") !== "off";
      } catch {}
      data = await nativeReceipt(element, includeLogo);
    } else {
      const canvas = await receiptCanvas(element);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Cannot render receipt image.");
      data = imageReceipt(
        canvas.width,
        canvas.height,
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      );
    }
    if (port) {
      await sendSerial(port, data);
      return;
    }
    await sendChunks(
      data,
      (chunk) =>
        target!.properties.write
          ? target!.writeValueWithResponse(chunk)
          : target!.writeValueWithoutResponse(chunk),
      20,
      native && target!.properties.write ? 0 : 5,
    );
  } finally {
    printing = false;
  }
}
