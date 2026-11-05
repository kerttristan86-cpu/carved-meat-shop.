import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir,readFile } from "node:fs/promises";
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
    await page.getByRole('button',{name:'Inventory',exact:true}).click();
    assert.ok(await page.getByText('Out of stock',{exact:true}).count()>=2);
    assert.ok(await page.getByText('Alert at ≤ 5.000 kg total',{exact:true}).count()>=1);
    await page.getByRole('row').filter({hasText:'Pork shoulder'}).getByRole('button',{name:'Restock',exact:true}).click();
    await page.screenshot({path:'test-results/restock-dialog.png',fullPage:true});await page.getByRole('dialog').getByRole('combobox').nth(1).selectOption('storage');
    await page.getByLabel('Add stock (kg)',{exact:true}).fill('2.500');
    await page.getByLabel('Supplier cost (PHP/kg)',{exact:true}).fill('150');
    await page.getByRole('button',{name:'Save record',exact:true}).click();
    await page.getByText('Saved successfully.',{exact:true}).waitFor();
    const restocked=await (await context.request.get('http://127.0.0.1:3100/api/shop')).json();
    assert.equal(restocked.stock.find((x:any)=>x.product_id===p.id&&x.location_id==='storage').quantity,82500);
    await page
      .getByRole("button", { name: "Sales / POS", exact: true })
      .click();
    await page.getByRole("button", { name: /QA-P1 · Pork/ }).click();
    await page.getByLabel("Quantity", { exact: true }).fill("5.950");
    await page
      .getByRole("button", { name: "Add to order", exact: true })
      .click();
    await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("1500");
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Saved receipt preview" }).waitFor();
    const printQuality = page.getByLabel("Print quality", {exact:true});
    assert.equal(await printQuality.inputValue(), "fast");
    await printQuality.selectOption("sharp");
    assert.equal(await page.evaluate(() => localStorage.getItem("carved-print-quality")), "sharp");
    await printQuality.selectOption("fast");
    assert.equal(await page.evaluate(() => localStorage.getItem("carved-print-quality")), "fast");

    await page.getByText("₱1,422.05", { exact: true }).first().waitFor();
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/tablet-receipt.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    const printBounds=await page.locator('#receipt').evaluate(el=>{const r=el.getBoundingClientRect();const padding=parseFloat(getComputedStyle(el).paddingRight);return {width:r.width,overflow:el.scrollWidth>el.clientWidth,amountsFit:[...el.querySelectorAll('.receipt-line b,.receipt-total > :last-child')].every(n=>n.getBoundingClientRect().right<=r.right-padding+1)};});
    assert.ok(printBounds.width<=273,'Receipt content must stay inside 72mm');
    assert.equal(printBounds.overflow,false);assert.equal(printBounds.amountsFit,true,'Full amounts, including decimals, must remain inset from the print edge');
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
    await page.getByRole("button", { name: "Save receipt image", exact: true }).click();
    const imageDownload = await receiptImage;
    await imageDownload.saveAs("test-results/bluetooth-receipt.png");
    const png = await readFile("test-results/bluetooth-receipt.png");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 576, "Thermal image uses the 72mm / 576-dot printable width");
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
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("dialog", { name: "Saved receipt preview" }).waitFor();
    await page.getByRole("button", { name: "Close receipt" }).click();
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
    await page.getByRole("dialog").getByRole("alert").waitFor();
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
    await page.getByRole('button',{name:'Products',exact:true}).click();
    await page.getByRole('button',{name:'Add product',exact:true}).click();
    await page.getByLabel('Product name',{exact:true}).fill('Auto-coded product');
    assert.equal(await page.getByLabel('Product code (optional)',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Save record',exact:true}).click();
    await page.getByText('Saved successfully.',{exact:true}).waitFor();
    const autoProducts=(await (await context.request.get('http://127.0.0.1:3100/api/shop')).json()).products;
    assert.match(autoProducts.find((p:any)=>p.name==='Auto-coded product').code,/^P\d{6,}$/);
    await page.getByRole('button',{name:'Invoices',exact:true}).click();
    await page.getByText('Accountant review — select invoices & export fields',{exact:true}).click();
    await page.locator('.review-list input[type=checkbox]').first().check();
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export selected CSV',exact:true}).click();const exportFile=await downloadEvent;await exportFile.saveAs('test-results/selected-invoices-review.csv');
    const exported=await readFile('test-results/selected-invoices-review.csv','utf8');assert.match(exported,/subset, not a complete BIR sales report/);assert.match(exported,/"Selected sales count","1"/);assert.match(exported,/Linked returns PHP/);
    const beforeLink=await (await context.request.get('http://127.0.0.1:3100/api/shop')).json();
    await page.getByRole('button',{name:'Link official invoice',exact:true}).first().click();await page.getByLabel('Official invoice number',{exact:true}).fill('QA-OFFICIAL-001');await page.getByRole('button',{name:'Save invoice link',exact:true}).click();await page.getByRole('dialog',{name:'Link official invoice',exact:true}).waitFor({state:'hidden'});
    const afterLink=await (await context.request.get('http://127.0.0.1:3100/api/shop')).json();assert.deepEqual(afterLink.report,beforeLink.report);assert.equal(afterLink.journals.length,beforeLink.journals.length);assert.equal(afterLink.documents.filter((d:any)=>d.kind==='invoiceLink').length,1);
    await page.getByRole('combobox',{name:'Invoice match status',exact:true}).selectOption('Unmatched');
    const monthlyEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export complete month CSV',exact:true}).click();const monthlyFile=await monthlyEvent;await monthlyFile.saveAs('test-results/monthly-invoice-reconciliation.csv');const monthlyCsv=await readFile('test-results/monthly-invoice-reconciliation.csv','utf8');assert.match(monthlyCsv,/QA-OFFICIAL-001/);assert.match(monthlyCsv,/Unmatched/);assert.match(monthlyCsv,/all saved sales and returns in period/);
    await page.screenshot({path:'test-results/invoice-reconciliation.png',fullPage:true});
    await page.getByRole('button',{name:'Audit history',exact:true}).click();
    await page.getByLabel('Search activity',{exact:true}).fill('Sale completed');
    const auditRow = page.locator('tbody tr').first();
    await auditRow.locator('summary').click();
    await auditRow.getByText('Shop owner',{exact:true}).waitFor();
    assert.equal(await auditRow.locator('pre').count(),0);
    assert.ok((await auditRow.innerText()).includes('Pork shoulder'));
    assert.ok((await auditRow.innerText()).includes('kg'));
    await page.screenshot({path:'test-results/audit-history-readable.png',fullPage:true});
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
