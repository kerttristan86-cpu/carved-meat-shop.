import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
async function main() {
  const email = "qa-owner@example.test",
    password = randomBytes(18).toString("hex");
  const env = {
    ...process.env,
    DATABASE_URL: "", // QA always uses its isolated embedded database.
    DATABASE_DIR: `./data/qa-${Date.now()}`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://127.0.0.1:3100",
    OWNER_EMAIL: email,
    OWNER_PASSWORD: password,
  };
  console.log("QA: bootstrapping isolated owner");
  const bootstrap = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/owner.ts"],
    { env, encoding: "utf8" },
  );
  if (bootstrap.status !== 0) throw new Error(bootstrap.stderr);
  console.log("QA: starting production server");
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3100"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  server.stdout.on("data", (b) => {
    logs += b;
  });
  server.stderr.on("data", (b) => {
    logs += b;
  });
  let browser;
  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3100")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
      if (i === 119) throw new Error(logs);
    }
    console.log("QA: launching browser");
    browser = await chromium.launch({
      headless: true,
      channel: process.env.QA_BROWSER || "chrome",
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const unauthorized = await context.request.get(
      "http://127.0.0.1:3100/api/shop",
    );
    assert.equal(unauthorized.status(), 401);
    const register = await context.request.post(
      "http://127.0.0.1:3100/api/auth/sign-up/email",
      {
        data: { email: "intruder@example.test", password, name: "Intruder" },
        headers: { origin: "http://127.0.0.1:3100" },
      },
    );
    assert.ok(register.status() >= 400);
    await page.goto("http://127.0.0.1:3100", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Owner email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("heading", { name: "A clear view of your shop." })
      .waitFor();
    let seq = 0;
    const api = async (action: string, data: any, key?: string) => {
      const r = await context.request.post("http://127.0.0.1:3100/api/shop", {
        data: { action, data, key: key || `qa-${++seq}` },
        headers: { origin: "http://127.0.0.1:3100" },
      });
      const out = await r.json();
      assert.ok(r.ok(), JSON.stringify(out));
      return out;
    };
    const p = await api("product", {
      code: "QA-P1",
      name: "Pork shoulder",
      category: "Pork",
      unit: "kg",
      retail: "239",
      bulk: "219",
      box: "219",
      lowStock: "5",
    });
    const supplier = await api("party", {
      name: "QA supplier",
      kind: "supplier",
    });
    const customer = await api("party", {
      name: "QA customer",
      kind: "customer",
    });
    const po = await api("purchase", {
      partyId: supplier.id,
      reference: "QA-100",
      lines: [{ productId: p.id, quantity: "100", cost: "150", boxes: 4 }],
    });
    await api("receive", {
      orderId: po.id,
      locationId: "storage",
      lines: [{ index: 0, quantity: "100", boxes: 4 }],
    });
    await api("transfer", {
      productId: p.id,
      from: "storage",
      to: "freezer",
      quantity: "20",
      reason: "QA retail replenishment",
    });
    await api("product", {
      code: "QA-C",
      name: "Chicken whole",
      category: "Chicken",
      unit: "kg",
      retail: "189",
      bulk: "175",
      lowStock: "5",
    });
    await api("product", {
      code: "QA-B",
      name: "Beef brisket",
      category: "Beef",
      unit: "kg",
      retail: "389",
      bulk: "359",
      lowStock: "5",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    assert.ok(
      (await page.getByText("Out of stock", { exact: true }).count()) >= 2,
    );
    assert.ok(
      (await page
        .getByText("Alert at ≤ 5.000 kg total", { exact: true })
        .count()) >= 1,
    );
    await page
      .getByRole("row")
      .filter({ hasText: "Pork shoulder" })
      .getByRole("button", { name: "Restock", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/restock-dialog.png",
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("combobox")
      .nth(1)
      .selectOption("storage");
    await page.getByLabel("Add stock (kg)", { exact: true }).fill("2.500");
    await page
      .getByLabel("Supplier cost (PHP/kg)", { exact: true })
      .fill("150");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    const restocked = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.equal(
      restocked.stock.find(
        (x: any) => x.product_id === p.id && x.location_id === "storage",
      ).quantity,
      82500,
    );
    await page.evaluate(`(() => {
      const state=window;state.qaPrintBytes=[];state.qaPrintTargets=[];state.qaPrinterChoices=0;state.qaPrinterDiscovery=0;state.qaPrinterName="QA native printer";state.qaWriteFailures=0;
      state.qaDevices={};
      Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Android QA"});
      const makeDevice=name=>{
        const characteristic={properties:{write:true,writeWithoutResponse:false},writeValueWithResponse:async(bytes)=>{
          if(state.qaWriteFailures>0){state.qaWriteFailures--;throw new Error("Simulated disconnect");}
          state.qaPrintTargets.push(name);state.qaPrintBytes.push(...Array.from(bytes));
        }};
        const gatt={connected:false,connect:async()=>{gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect:()=>{gatt.connected=false;}};
        return {name,gatt};
      };
      localStorage.setItem("carved-bluetooth-printer","QA remembered printer");
      Object.defineProperty(navigator,"bluetooth",{configurable:true,value:{
        requestDevice:async()=>{state.qaPrinterChoices++;const d=makeDevice(state.qaPrinterName);state.qaDevices[d.name]=d;return d;},
        getDevices:async()=>{state.qaPrinterDiscovery++;return [makeDevice("QA remembered printer")];}
      }});
    })()`);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("heading", { name: "Printer & data", exact: true })
      .waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "No printer connected" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterChoices),
      0,
    );
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterDiscovery),
      0,
    );
    await page
      .getByRole("button", { name: "Connect printer", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Connected: QA native printer" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as any).qaPrintBytes.length),
      0,
      "Pairing must not print anything",
    );
    await page.evaluate(() => {
      (window as any).qaPrinterName = "QA selected printer";
    });
    await page
      .getByRole("button", { name: "Change printer", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Connected: QA selected printer" })
      .waitFor();
    await page.screenshot({
      path: "test-results/settings-printer-android.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Sales / POS", exact: true })
      .click();
    const beforeBadCount = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    const badCount = await context.request.post(
      "http://127.0.0.1:3100/api/shop",
      {
        data: {
          action: "sale",
          key: "qa-invalid-box-count",
          data: {
            locationId: "freezer",
            lines: [
              { productId: p.id, quantity: "1.250", tier: "box", boxes: 1.25 },
            ],
            tendered: "300",
          },
        },
        headers: { origin: "http://127.0.0.1:3100" },
      },
    );
    assert.equal(badCount.status(), 400);
    const badCountError = await badCount.json();
    assert.match(badCountError.error, /Box count must be a whole number/);
    assert.ok(!badCountError.error.includes("invalid_type"));
    const invalidIndex = await context.request.post(
      "http://127.0.0.1:3100/api/shop",
      {
        data: {
          action: "receive",
          key: "qa-invalid-line-index",
          data: {
            orderId: po.id,
            locationId: "storage",
            lines: [{ index: 0.5, quantity: "1", boxes: 0 }],
          },
        },
        headers: { origin: "http://127.0.0.1:3100" },
      },
    );
    assert.equal(invalidIndex.status(), 400);
    const invalidIndexError = await invalidIndex.json();
    assert.match(invalidIndexError.error, /whole number/);
    assert.ok(!invalidIndexError.error.includes("safeint"));
    const afterBadCount = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.deepEqual(afterBadCount.stock, beforeBadCount.stock);
    assert.equal(
      afterBadCount.documents.length,
      beforeBadCount.documents.length,
    );
    await page.getByRole("button", { name: /QA-P1 · Pork/ }).click();
    await page
      .getByLabel("Selling price tier", { exact: true })
      .selectOption("box");
    await page.getByLabel("Quantity", { exact: true }).fill("1.250");
    await page
      .getByLabel("Box count (actual kg entered separately)", { exact: true })
      .fill("1.25");
    await page
      .getByRole("button", { name: "Add to order", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Box count must be a whole number" })
      .waitFor();
    assert.equal(
      await page.locator(".cart-line").count(),
      0,
      "Invalid box counts must be rejected before adding to the cart",
    );
    assert.equal(
      await page
        .locator(".toast-error")
        .filter({ hasText: "Box count must be a whole number" })
        .count(),
      1,
    );
    assert.equal(
      await page.locator(".error[role=alert]").count(),
      0,
      "Errors use toasts rather than inline banners",
    );
    assert.match(
      await page
        .locator(".toast-error")
        .evaluate((el) => getComputedStyle(el).animationName),
      /shop-toast-in/,
    );
    await page.screenshot({
      path: "test-results/pos-error-toast.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Dismiss error", exact: true })
      .click();
    await page.locator(".toast-error").waitFor({ state: "hidden" });

    await page.screenshot({
      path: "test-results/pos-box-count-validation.png",
      fullPage: true,
    });
    await page
      .getByLabel("Selling price tier", { exact: true })
      .selectOption("retail");
    assert.equal(
      await page
        .getByLabel("Box count (actual kg entered separately)", { exact: true })
        .count(),
      0,
    );
    await page.getByLabel("Quantity", { exact: true }).fill("5.950");
    await page
      .getByRole("button", { name: "Add to order", exact: true })
      .click();
    await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("1500");
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Saved receipt preview" }).waitFor();
    const receiptMotion = await page
      .locator(".receipt-dialog")
      .evaluate((el) => ({
        transform: getComputedStyle(el).transform,
        animation: getComputedStyle(el).animationName,
        backdropAnimation: getComputedStyle(el.parentElement!).animationName,
      }));
    assert.deepEqual(
      receiptMotion,
      { transform: "none", animation: "none", backdropAnimation: "none" },
      "Receipt capture must remain exact even during immediate automatic printing",
    );
    const printQuality = page.getByLabel("Print mode", { exact: true });
    assert.equal(await printQuality.inputValue(), "fast");
    await printQuality.selectOption("sharp");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("carved-print-quality")),
      "sharp",
    );
    await printQuality.selectOption("fast");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("carved-print-quality")),
      "fast",
    );

    await page.getByText("₱1,422.05", { exact: true }).first().waitFor();
    try {
      await page
        .getByRole("status")
        .filter({ hasText: "Receipt sent to QA selected printer" })
        .waitFor();
    } catch (error) {
      console.log(
        "Receipt status:",
        await page.getByRole("status").allTextContents(),
      );
      throw error;
    }
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterChoices),
      2,
      "POS must reuse the manually selected Settings printer",
    );
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterDiscovery),
      0,
      "No background printer discovery may override the selected printer",
    );
    assert.deepEqual(
      await page.evaluate(() => [...new Set((window as any).qaPrintTargets)]),
      ["QA selected printer"],
    );
    const nativeWithLogo = await page.evaluate(
      () => (window as any).qaPrintBytes as number[],
    );
    assert.ok(
      nativeWithLogo.length < 2500,
      "Native body plus 96-dot logo remains compact",
    );
    const logoHeader = nativeWithLogo.findIndex(
      (b, i) =>
        b === 29 &&
        nativeWithLogo[i + 1] === 118 &&
        nativeWithLogo[i + 2] === 48,
    );
    assert.ok(logoHeader >= 0, "Native receipt includes the logo raster");
    assert.deepEqual(
      nativeWithLogo.slice(logoHeader, logoHeader + 8),
      [29, 118, 48, 0, 12, 0, 96, 0],
    );
    const cutSequence = [27, 100, 4, 29, 86, 66, 0];
    const cutCount = (bytes: number[]) =>
      bytes.filter((_, i) => cutSequence.every((b, k) => bytes[i + k] === b))
        .length;
    assert.deepEqual(nativeWithLogo.slice(-7), cutSequence);
    assert.equal(
      cutCount(nativeWithLogo),
      1,
      "New POS sale prints exactly one complete receipt",
    );
    assert.ok(
      new TextDecoder()
        .decode(new Uint8Array(nativeWithLogo))
        .includes("PHP 1,422.05"),
    );
    await page.getByLabel(/Include logo/).uncheck();
    await page.evaluate(() => {
      (window as any).qaPrintBytes = [];
    });
    await page
      .getByRole("button", { name: "Print receipt", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Receipt sent to the printer" })
      .waitFor();
    const nativeNoLogo = await page.evaluate(
      () => (window as any).qaPrintBytes as number[],
    );
    assert.ok(
      nativeNoLogo.length < 1500,
      "Text-only receipt should be far smaller than an image",
    );
    const nativeText = new TextDecoder().decode(new Uint8Array(nativeNoLogo));
    assert.ok(nativeText.includes("Pork shoulder"));
    assert.ok(nativeText.includes("PHP 1,422.05"));
    assert.deepEqual(nativeNoLogo.slice(-7), [27, 100, 4, 29, 86, 66, 0]);
    console.log(
      `Native receipt bytes: ${nativeWithLogo.length} with logo; ${nativeNoLogo.length} text only`,
    );
    await page.getByLabel(/Include logo/).check();

    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/tablet-receipt.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    const printBounds = await page.locator("#receipt").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const padding = parseFloat(getComputedStyle(el).paddingRight);
      return {
        width: r.width,
        overflow: el.scrollWidth > el.clientWidth,
        amountsFit: [
          ...el.querySelectorAll(
            ".receipt-line b,.receipt-total > :last-child",
          ),
        ].every(
          (n) => n.getBoundingClientRect().right <= r.right - padding + 1,
        ),
      };
    });
    assert.ok(
      printBounds.width <= 273,
      "Receipt content must stay inside 72mm",
    );
    assert.equal(printBounds.overflow, false);
    assert.equal(
      printBounds.amountsFit,
      true,
      "Full amounts, including decimals, must remain inset from the print edge",
    );
    await page.screenshot({
      path: "test-results/receipt-print.png",
      fullPage: true,
    });
    await page.pdf({
      path: "test-results/receipt-80mm.pdf",
      width: "80mm",
      height: "240mm",
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    const receiptImage = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save receipt image", exact: true })
      .click();
    const imageDownload = await receiptImage;
    await imageDownload.saveAs("test-results/bluetooth-receipt.png");
    const png = await readFile("test-results/bluetooth-receipt.png");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(
      png.readUInt32BE(16),
      576,
      "Thermal image uses the 72mm / 576-dot printable width",
    );
    assert.ok(png.readUInt32BE(20) > 300);
    await page.getByText(/Receipt image saved/).waitFor();
    const before = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.equal(
      before.documents.filter((d: any) => d.kind === "sale").length,
      1,
    );
    await page.getByRole("button", { name: "Close receipt" }).click();
    await page.getByRole("button", { name: "Receipts", exact: true }).click();
    await page.evaluate(() => {
      (window as any).qaPrintBytes = [];
    });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("dialog", { name: "Saved receipt preview" }).waitFor();
    await page
      .getByRole("button", {
        name: "Connected: QA selected printer",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as any).qaPrintBytes.length),
      0,
      "Saved receipts never auto-print",
    );
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterChoices),
      2,
    );
    await page
      .getByRole("button", { name: "Print receipt", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Receipt sent to the printer" })
      .waitFor();
    const reprint = await page.evaluate(
      () => (window as any).qaPrintBytes as number[],
    );
    assert.ok(
      new TextDecoder()
        .decode(new Uint8Array(reprint))
        .includes("PHP 1,422.05"),
    );
    assert.equal(
      cutCount(reprint),
      1,
      "One manual tap prints one saved receipt",
    );
    // A failed write must not trigger an automatic resend.
    await page.evaluate(() => {
      (window as any).qaPrintBytes = [];
      (window as any).qaWriteFailures = 1;
    });
    await page
      .getByRole("button", { name: "Print receipt", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "may be partial" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as any).qaPrintBytes.length),
      0,
    );
    await page.getByRole("button", { name: "Close receipt" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Connected: QA selected printer" })
      .waitFor();
    await page.evaluate(() => {
      (window as any).qaDevices["QA selected printer"].gatt.connected = false;
    });
    await page
      .getByRole("status")
      .filter({ hasText: "No printer connected" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterChoices),
      2,
      "Disconnected status must not open a chooser",
    );
    assert.equal(
      await page.evaluate(() => (window as any).qaPrinterDiscovery),
      0,
    );
    // Another browser context may share the login, but never the printer state.
    const otherContext = await browser.newContext({
      storageState: { cookies: await context.cookies(), origins: [] },
    });
    const otherPage = await otherContext.newPage();
    await otherPage.goto("http://127.0.0.1:3100", {
      waitUntil: "domcontentloaded",
    });
    await otherPage
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await otherPage
      .getByRole("status")
      .filter({ hasText: "No printer connected" })
      .waitFor();
    await otherContext.close();
    const sale = before.documents.find((d: any) => d.kind === "sale");
    assert.equal(sale.data.change, 7795);
    assert.equal(
      before.stock.find(
        (s: any) => s.product_id === p.id && s.location_id === "freezer",
      ).quantity,
      14050,
    );
    await api("expense", {
      category: "Electricity",
      payee: "QA utility",
      amount: "250",
      date: new Date().toISOString().slice(0, 10),
    });
    await api("return", {
      saleId: sale.id,
      index: 0,
      quantity: "1",
      restock: true,
      reason: "QA return",
    });
    await api("supplierPayment", { documentId: po.id, amount: "5000" });
    const credit = await api("sale", {
      partyId: customer.id,
      locationId: "freezer",
      lines: [{ productId: p.id, quantity: "1", tier: "retail" }],
      tendered: "100",
    });
    await api("payment", {
      documentId: credit.id,
      amount: "50",
      tendered: "100",
    });
    const after = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.equal(after.report.balanced, true);
    assert.equal(
      after.documents.filter((d: any) => d.kind === "sale").length,
      2,
    );
    const csrf = await context.request.post("http://127.0.0.1:3100/api/shop", {
      data: { action: "location", data: { name: "Bad" }, key: "csrf" },
      headers: { origin: "https://evil.example" },
    });
    assert.equal(csrf.status(), 403);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.screenshot({
      path: "test-results/tablet-landscape.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({
      path: "test-results/tablet-portrait.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Sales / POS", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/tablet-pos-portrait.png",
      fullPage: true,
    });
    for (const label of [
      "Inventory",
      "Purchases",
      "Invoices",
      "Receipts",
      "Expenses",
      "Accounting",
      "Products",
      "Customers & suppliers",
      "Audit history",
      "Settings",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("heading", { name: label, exact: true }).waitFor();
      assert.ok(await page.locator("main").isVisible());
    }
    // Lose a response after the server commits, reload, and retry the original request.
    await page
      .getByRole("button", { name: "Sales / POS", exact: true })
      .click();
    await page.getByRole("button", { name: /QA-P1 · Pork/ }).click();
    await page.getByLabel("Quantity", { exact: true }).fill("0.010");
    await page
      .getByRole("button", { name: "Add to order", exact: true })
      .click();
    await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("3.00");
    let lost = false;
    await page.route("**/api/shop", async (route) => {
      if (
        route.request().method() === "POST" &&
        !lost &&
        route.request().postDataJSON().action === "sale"
      ) {
        lost = true;
        const response = await route.fetch();
        assert.ok(response.ok());
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "retry checkout" })
      .waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Sales / POS", exact: true })
      .click();
    await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("4.00");
    assert.equal(
      await page
        .getByLabel("Cash tendered (PHP)", { exact: true })
        .inputValue(),
      "3.00",
    );
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Saved receipt preview" }).waitFor();
    const recovered = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.equal(
      recovered.documents.filter((d: any) => d.kind === "sale").length,
      3,
    );
    await page.getByRole("button", { name: "Close receipt" }).click();
    const attachmentExpense = await api("expense", {
      category: "Supplies",
      payee: "QA attachment",
      amount: "1",
      date: "2026-10-30",
      paymentAccount: "Bank",
    });
    const uploaded = await context.request.post(
      "http://127.0.0.1:3100/api/attachments",
      {
        headers: { origin: "http://127.0.0.1:3100" },
        multipart: {
          documentId: attachmentExpense.id,
          file: {
            name: "receipt.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("%PDF-1.4 test"),
          },
        },
      },
    );
    assert.ok(uploaded.ok(), await uploaded.text());
    const file = await uploaded.json();
    assert.equal(
      (
        await context.request.get(
          "http://127.0.0.1:3100/api/attachments/" + file.id,
        )
      ).status(),
      200,
    );
    // Payments/expenses also keep their original identity across an uncertain response.
    let lostExpense = false;
    await page.route("**/api/shop", async (route) => {
      if (
        route.request().method() === "POST" &&
        !lostExpense &&
        route.request().postDataJSON().action === "expense"
      ) {
        lostExpense = true;
        const r = await route.fetch();
        assert.ok(r.ok());
        await route.abort("failed");
      } else await route.continue();
    });
    const expenseCount = (
      await (await context.request.get("http://127.0.0.1:3100/api/shop")).json()
    ).documents.filter((d: any) => d.kind === "expense").length;
    await page.getByRole("button", { name: "Expenses", exact: true }).click();
    await page
      .getByRole("button", { name: "Record expense", exact: true })
      .click();
    await page
      .getByLabel("Category", { exact: true })
      .fill("Lost response fixture");
    await page.getByLabel("Payee", { exact: true }).fill("QA store");
    await page.getByLabel("Amount (PHP)", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page.locator(".toast-error").waitFor();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Confirm pending record", exact: true })
      .click();
    await page
      .getByText("Original record confirmed. It was posted once.", {
        exact: true,
      })
      .waitFor();
    const confirmed = (
      await (await context.request.get("http://127.0.0.1:3100/api/shop")).json()
    ).documents.filter((d: any) => d.kind === "expense");
    assert.equal(confirmed.length, expenseCount + 1);
    await page.route("**/api/attachments", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Expenses", exact: true }).click();
    await page
      .getByRole("button", { name: "Record expense", exact: true })
      .click();
    await page
      .getByLabel("Category", { exact: true })
      .fill("Attachment failure fixture");
    await page.getByLabel("Payee", { exact: true }).fill("QA store");
    await page.getByLabel("Amount (PHP)", { exact: true }).fill("3");
    await page.locator("input[type=file]").setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 QA"),
    });
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Expense saved. Attachment" })
      .waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0);
    const uploadFailed = (
      await (await context.request.get("http://127.0.0.1:3100/api/shop")).json()
    ).documents.filter((d: any) => d.kind === "expense");
    assert.equal(uploadFailed.length, expenseCount + 2);
    await page.getByRole("button", { name: "Products", exact: true }).click();
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    const productDialog = page.getByRole("dialog", {
      name: "product",
      exact: true,
    });
    assert.match(
      await productDialog.evaluate((el) => getComputedStyle(el).animationName),
      /shop-dialog-in/,
    );
    assert.equal(
      await productDialog.getByRole("button", { name: "Close dialog" }).count(),
      1,
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest('[role="dialog"],[data-toast]'),
        ),
      ),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await productDialog
        .getByRole("button", { name: "Close dialog" })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    await productDialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Add product", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await page
      .getByLabel("Product name", { exact: true })
      .fill("Auto-coded product");
    assert.equal(
      await page
        .getByLabel("Product code (optional)", { exact: true })
        .inputValue(),
      "",
    );
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route("**/api/shop", async (route) => {
      if (route.request().method() === "POST") await saveGate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .locator(".loading-overlay")
      .getByText("Saving changes…", { exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await productDialog.count(),
      1,
      "Saving forms cannot be dismissed",
    );
    assert.equal(
      await productDialog
        .getByRole("button", { name: "Close dialog" })
        .isDisabled(),
      true,
    );
    await page.screenshot({ path: "test-results/modal-saving.png" });
    releaseSave();
    await productDialog.waitFor({ state: "hidden" });
    await page.unroute("**/api/shop");
    await page.getByText("Saved successfully.", { exact: true }).waitFor();
    const autoProducts = (
      await (await context.request.get("http://127.0.0.1:3100/api/shop")).json()
    ).products;
    assert.match(
      autoProducts.find((p: any) => p.name === "Auto-coded product").code,
      /^P\d{6,}$/,
    );
    await page.getByRole("button", { name: "Invoices", exact: true }).click();
    await page
      .getByText("Accountant review — select invoices & export fields", {
        exact: true,
      })
      .click();
    await page.locator(".review-list input[type=checkbox]").first().check();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export selected CSV", exact: true })
      .click();
    const exportFile = await downloadEvent;
    await exportFile.saveAs("test-results/selected-invoices-review.csv");
    const exported = await readFile(
      "test-results/selected-invoices-review.csv",
      "utf8",
    );
    assert.match(exported, /subset, not a complete BIR sales report/);
    assert.match(exported, /"Selected sales count","1"/);
    assert.match(exported, /Linked returns PHP/);
    const beforeLink = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    await page
      .getByRole("button", { name: "Link official invoice", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Official invoice number", { exact: true })
      .fill("QA-OFFICIAL-001");
    await page
      .getByRole("button", { name: "Save invoice link", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Link official invoice", exact: true })
      .waitFor({ state: "hidden" });
    const afterLink = await (
      await context.request.get("http://127.0.0.1:3100/api/shop")
    ).json();
    assert.deepEqual(afterLink.report, beforeLink.report);
    assert.equal(afterLink.journals.length, beforeLink.journals.length);
    assert.equal(
      afterLink.documents.filter((d: any) => d.kind === "invoiceLink").length,
      1,
    );
    await page
      .getByRole("combobox", { name: "Invoice match status", exact: true })
      .selectOption("Unmatched");
    const monthlyEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export complete month CSV", exact: true })
      .click();
    const monthlyFile = await monthlyEvent;
    await monthlyFile.saveAs("test-results/monthly-invoice-reconciliation.csv");
    const monthlyCsv = await readFile(
      "test-results/monthly-invoice-reconciliation.csv",
      "utf8",
    );
    assert.match(monthlyCsv, /QA-OFFICIAL-001/);
    assert.match(monthlyCsv, /Unmatched/);
    assert.match(monthlyCsv, /all saved sales and returns in period/);
    await page.screenshot({
      path: "test-results/invoice-reconciliation.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Audit history", exact: true })
      .click();
    await page
      .getByLabel("Search activity", { exact: true })
      .fill("Sale completed");
    const auditRow = page.locator("tbody tr").first();
    await auditRow.locator("summary").click();
    await auditRow.getByText("Shop owner", { exact: true }).waitFor();
    assert.equal(await auditRow.locator("pre").count(), 0);
    assert.ok((await auditRow.innerText()).includes("Pork shoulder"));
    assert.ok((await auditRow.innerText()).includes("kg"));
    await page.screenshot({
      path: "test-results/audit-history-readable.png",
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Products", exact: true }).click();
    assert.equal(
      await page
        .locator("main.main")
        .evaluate((el) => el.getAnimations().length),
      0,
    );
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("dialog")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog" })
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: owner login, closed registration, authorization, CSRF, purchase/receive/transfer, tablet POS, decimal sale/change, receipt preview/reprint, expense, return, partial balances, all modules, tablet screenshots and 80mm PDF.",
    );
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
