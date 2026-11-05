// ESC/POS monochrome raster. Rasterizing the existing preview preserves the logo,
// peso symbol, decimal amounts and layout without relying on printer code pages.
export function rasterCommands(
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
    throw new Error("Receipt image dimensions are invalid or too large.");
  const rowBytes = Math.ceil(width / 8);
  const parts: number[] = [27, 64];
  // Short raster bands avoid printer buffer/height limits.
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
    for (let y = top; y < top + rows; y++) {
      for (let bx = 0; bx < rowBytes; bx++) {
        let bits = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= width) continue;
          const i = (y * width + x) * 4,
            a = rgba[i + 3] / 255;
          const luminance =
            (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a +
            255 * (1 - a);
          if (luminance < 180) bits |= 128 >> bit;
        }
        parts.push(bits);
      }
    }
  }
  parts.push(27, 100, 4, 29, 86, 66, 0);
  return Uint8Array.from(parts);
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
  output.height = Math.ceil(canvas.height * 576 / canvas.width);
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
const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
function usesSerial() {
  return (
    "serial" in navigator && !/android/i.test(navigator.userAgent)
  );
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
      allowedBluetoothServiceClassIds: [
        "00001101-0000-1000-8000-00805f9b34fb",
      ],
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
    const canvas = await receiptCanvas(element);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render receipt image.");
    const data = rasterCommands(
      canvas.width,
      canvas.height,
      ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    );
    if (port) {
      await sendSerial(port, data);
      return;
    }
    await sendChunks(data, (chunk) =>
      target!.properties.write
        ? target!.writeValueWithResponse(chunk)
        : target!.writeValueWithoutResponse(chunk),
    );
  } finally {
    printing = false;
  }
}
