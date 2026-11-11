import assert from "node:assert/strict";
import type { Page, BrowserContext } from "@playwright/test";
export async function verifyMultiweights(page: Page, context: BrowserContext) {
  let seq = 0;
  const api = async (action: string, data: Record<string, any>) => {
    const r = await context.request.post("http://127.0.0.1:3100/api/shop", {
      data: { action, data, key: `weights-qa-${++seq}` },
      headers: { origin: "http://127.0.0.1:3100" },
    });
    const out = await r.json();
    assert.ok(r.ok(), JSON.stringify(out));
    return out;
  };
  const p = await api("product", {
    code: "QA-WEIGHTS",
    name: "Multi box pork",
    category: "Pork",
    unit: "kg",
    retail: "200",
    box: "170",
  });
  const supplier = await api("party", {
    name: "Weights supplier",
    kind: "supplier",
  });
  await api("restock", {
    productId: p.id,
    partyId: supplier.id,
    locationId: "freezer",
    quantity: "40",
    cost: "100",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(`(() => {
  window.qaWeightBytes=[];
  Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Android QA"});
  const characteristic={properties:{write:true,writeWithoutResponse:false},writeValueWithResponse:async b=>window.qaWeightBytes.push(...Array.from(b))};
  const gatt={connected:false,connect:async()=>{gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async()=>characteristic})};},disconnect:()=>{gatt.connected=false;}};
  Object.defineProperty(navigator,"bluetooth",{configurable:true,value:{requestDevice:async()=>({name:"QA weight printer",gatt}),getDevices:async()=>[]}});
 })()`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: /^(Connect|Change) printer$/ })
    .click();
  await page
    .getByRole("button", {
      name: "Printer connected: QA weight printer",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  await page.getByRole("button", { name: /QA-WEIGHTS/ }).click();
  await page
    .getByLabel("Selling price tier", { exact: true })
    .selectOption("box");
  await page
    .getByRole("checkbox", { name: "Enter multiple box weights", exact: true })
    .check();
  await page
    .getByLabel("Weights per box / entry (kg)", { exact: true })
    .fill("11.67\n11.46\n11.39");
  assert.equal(
    await page.getByLabel("Quantity", { exact: true }).inputValue(),
    "34.520",
  );
  assert.equal(
    await page
      .getByLabel("Box count (actual kg entered separately)", { exact: true })
      .inputValue(),
    "3",
  );
  await page.screenshot({
    path: "test-results/multiple-box-weights.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  await page
    .getByRole("button", { name: "Save invoice draft", exact: true })
    .click();
  await page.getByText("Draft saved. Stock and accounting will post at checkout.", { exact: true }).waitFor();
  const draftState = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  const draft = draftState.documents.find(
    (d: any) =>
      d.kind === "draft" && d.data.lines.some((l: any) => l.productId === p.id),
  );
  assert.deepEqual(draft.data.lines[0].weightEntries, [11670, 11460, 11390]);
  const label = `${draftState.settings.prefix}-${String(draft.number).padStart(6, "0")}`;
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: label })
    .getByRole("button", { name: "Open in POS", exact: true })
    .click();
  await page.getByLabel("Cash tendered (PHP)", { exact: true }).fill("6000");
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Saved receipt preview", exact: true })
    .waitFor();
  const receipt = await page.locator("#receipt").innerText();
  assert.match(receipt, /34\.520/);
  assert.match(receipt, /3 boxes/);
  assert.match(receipt, /11\.670.*11\.460.*11\.390/s);
  assert.match(receipt, /5,868\.40/);
  await page
    .getByRole("status")
    .filter({ hasText: "Receipt sent to QA weight printer" })
    .waitFor();
  const bytes = await page.evaluate(
    () => (window as any).qaWeightBytes as number[],
  );
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  assert.match(text, /Weights \(kg\):/);
  assert.match(text, /11\.670.*11\.460.*11\.390/s);
  assert.match(text, /PHP 5,868\.40/);
  assert.deepEqual(bytes.slice(-7), [27, 100, 4, 29, 86, 66, 0]);
  const final = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  assert.equal(
    final.stock.find(
      (x: any) => x.product_id === p.id && x.location_id === "freezer",
    ).quantity,
    5480,
  );
  assert.equal(final.report.balanced, true);
  await page.screenshot({
    path: "test-results/multiple-box-receipt.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close receipt", exact: true })
    .click();
  console.log(
    "PASS: multiple box weights, draft restore, exact totals/stock, receipt breakdown and native Bluetooth bytes.",
  );
}
