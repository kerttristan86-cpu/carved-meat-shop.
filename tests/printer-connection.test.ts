import { test } from "node:test";
import assert from "node:assert/strict";
import {
  printerConnectionStatus,
  connectBluetoothPrinter,
} from "../lib/thermal-printer";
test("printer status follows the live BLE connection without pairing or discovery", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let choices = 0,
    discoveries = 0;
  const gatt = {
    connected: false,
    connect: async () => {
      gatt.connected = true;
      return {
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            properties: { write: true, writeWithoutResponse: false },
          }),
        }),
      };
    },
    disconnect: () => {
      gatt.connected = false;
    },
  };
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { isSecureContext: true },
    });
    const nav: any = {
      userAgent: "Android",
      bluetooth: {
        requestDevice: async () => {
          choices++;
          return { name: "QA printer", gatt };
        },
        getDevices: async () => {
          discoveries++;
          return [];
        },
      },
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: nav,
    });
    assert.equal(printerConnectionStatus().state, "disconnected");
    await connectBluetoothPrinter();
    assert.deepEqual(printerConnectionStatus(), {
      state: "connected",
      name: "QA printer",
    });
    gatt.connected = false;
    assert.equal(printerConnectionStatus().state, "disconnected");
    assert.equal(choices, 1);
    assert.equal(discoveries, 0);
    nav.bluetooth = undefined;
    assert.equal(printerConnectionStatus().state, "unsupported");
    nav.userAgent = "Windows";
    const port: any = { writable: null };
    nav.serial = { requestPort: async () => port };
    await connectBluetoothPrinter();
    assert.equal(
      printerConnectionStatus().state,
      "selected",
      "Selecting a desktop port is not a verified open connection",
    );
    port.writable = {};
    assert.equal(printerConnectionStatus().state, "connected");
    port.writable = null;
    assert.equal(printerConnectionStatus().state, "selected");
  } finally {
    if (originalNavigator)
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
