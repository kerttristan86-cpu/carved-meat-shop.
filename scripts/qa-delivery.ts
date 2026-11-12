import assert from "node:assert/strict";
import type { Page, BrowserContext } from "@playwright/test";
export async function verifyDelivery(page: Page, context: BrowserContext) {
  let seq = 0;
  const api = async (action: string, data: Record<string, any>) => {
    const r = await context.request.post("http://127.0.0.1:3100/api/shop", {
      data: { action, data, key: `delivery-qa-${++seq}` },
      headers: { origin: "http://127.0.0.1:3100" },
    });
    const out = await r.json();
    assert.ok(r.ok(), JSON.stringify(out));
    return out;
  };
  const p = await api("product", {
    code: "QA-DELIVERY",
    name: "Delivery pork",
    category: "Pork",
    unit: "kg",
    retail: "200",
  });
  const supplier = await api("party", {
    name: "Delivery supplier",
    kind: "supplier",
  });
  await api("restock", {
    productId: p.id,
    partyId: supplier.id,
    locationId: "freezer",
    quantity: "5",
    cost: "100",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  await page.getByRole("button", { name: /QA-DELIVERY/ }).click();
  await page.getByLabel("Quantity", { exact: true }).fill(".50");
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  assert.match(await page.locator(".cart-line").innerText(), /0\.500/);
  await page.getByLabel("Order type", { exact: true }).selectOption("delivery");
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Delivery recipient is required" })
    .waitFor();
  await page
    .getByLabel("Delivery recipient", { exact: true })
    .fill("QA Recipient");
  await page
    .getByLabel("Delivery contact number", { exact: true })
    .fill("09123456789");
  await page
    .getByLabel("Delivery address", { exact: true })
    .fill("QA Street, Laguna");
  await page
    .getByLabel("Delivery notes (optional)", { exact: true })
    .fill("Call on arrival");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  assert.equal(
    await page.getByLabel("Order type", { exact: true }).inputValue(),
    "delivery",
  );
  assert.equal(
    await page.getByLabel("Delivery address", { exact: true }).inputValue(),
    "QA Street, Laguna",
  );
  await page.screenshot({
    path: "test-results/delivery-checkout.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save invoice draft", exact: true })
    .click();
  await page
    .getByText("Draft saved. Stock and accounting will post at checkout.", {
      exact: true,
    })
    .waitFor();
  const state = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  const draft = state.documents.find(
    (d: any) =>
      d.kind === "draft" && d.data.lines.some((l: any) => l.productId === p.id),
  );
  const label = `${state.settings.prefix}-${String(draft.number).padStart(6, "0")}`;
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: label })
    .getByRole("button", { name: "Open in POS", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Order type", { exact: true }).inputValue(),
    "delivery",
  );
  assert.equal(
    await page
      .getByLabel("Delivery contact number", { exact: true })
      .inputValue(),
    "09123456789",
  );
  await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Saved receipt preview", exact: true })
    .waitFor();
  const receipt = await page.locator("#receipt").innerText();
  assert.match(receipt, /DELIVERY/);
  assert.match(receipt, /QA Recipient/);
  assert.match(receipt, /09123456789/);
  assert.match(receipt, /QA Street, Laguna/);
  assert.match(receipt, /Call on arrival/);
  assert.ok(!receipt.includes("Walk-in customer"));
  await page.evaluate(`(() => {
 window.qaDeliveryBytes=[];Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Android QA"});
 const characteristic={properties:{write:true,writeWithoutResponse:false},writeValueWithResponse:async b=>window.qaDeliveryBytes.push(...Array.from(b))};
 const gatt={connected:false,connect:async()=>{gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect:()=>{gatt.connected=false;}};
 Object.defineProperty(navigator,"bluetooth",{configurable:true,value:{requestDevice:async()=>({name:"QA delivery printer",gatt}),getDevices:async()=>[]}});
 })()`);
  await page
    .getByRole("button", { name: "Connect printer", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Receipt sent to QA delivery printer" })
    .waitFor();
  const bytes = await page.evaluate(
    () => (window as any).qaDeliveryBytes as number[],
  );
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  assert.match(text, /DELIVERY/);
  assert.match(text, /QA Street, Laguna/);
  assert.match(text, /09123456789/);
  assert.deepEqual(bytes.slice(-7), [27, 100, 4, 29, 86, 66, 0]);
  const final = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  const sale = final.documents.find(
    (d: any) =>
      d.kind === "sale" && d.data.lines.some((l: any) => l.productId === p.id),
  );
  assert.equal(sale.data.total, 10000);
  assert.equal(sale.data.fulfillment, "delivery");
  assert.equal(
    final.stock.find(
      (x: any) => x.product_id === p.id && x.location_id === "freezer",
    ).quantity,
    4500,
  );
  assert.equal(final.report.balanced, true);
  await page.screenshot({
    path: "test-results/delivery-receipt.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close receipt", exact: true })
    .click();
  console.log(
    "PASS: .50 kg, delivery validation/cart reload/draft restore, exact checkout and printed delivery details.",
  );
}
