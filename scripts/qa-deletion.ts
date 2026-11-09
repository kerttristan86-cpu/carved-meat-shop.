import assert from "node:assert/strict";
import type { Page, BrowserContext } from "@playwright/test";
export async function verifyDeletion(page: Page, context: BrowserContext) {
  let seq = 0;
  const api = async (action: string, data: Record<string, any>) => {
    const response = await context.request.post(
      "http://127.0.0.1:3100/api/shop",
      {
        data: { action, data, key: `delete-qa-${++seq}` },
        headers: { origin: "http://127.0.0.1:3100" },
      },
    );
    const result = await response.json();
    assert.ok(response.ok(), JSON.stringify(result));
    return result;
  };
  const p = await api("product", {
    code: "QA-DEL-S",
    name: "QA delete service",
    category: "Service",
    unit: "service",
    retail: "10",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  const add = async () => {
    await page.getByRole("button", { name: /QA-DEL-S/ }).click();
    await page.getByLabel("Quantity", { exact: true }).fill("1");
    await page
      .getByRole("button", { name: "Add to order", exact: true })
      .click();
  };
  await add();
  await page
    .getByRole("button", {
      name: "Delete QA delete service from order",
      exact: true,
    })
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Confirm deletion",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator(".cart-line").count(), 1);
  await page
    .getByRole("button", {
      name: "Delete QA delete service from order",
      exact: true,
    })
    .click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(await page.locator(".cart-line").count(), 0);
  await add();
  await page
    .getByRole("button", { name: "Delete current order", exact: true })
    .click();
  await page.screenshot({ path: "test-results/delete-current-order.png" });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  assert.equal(await page.locator(".cart-line").count(), 0);
  const draft = await api("draft", {
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "1", tier: "retail" }],
    tendered: "0",
  });
  const before = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  const d = before.documents.find((x: any) => x.id === draft.id);
  const label = `${before.settings.prefix}-${String(d.number).padStart(6, "0")}`;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("button", { name: `Delete ${label}`, exact: true })
    .click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: `Delete ${label}`, exact: true })
      .count(),
    0,
  );
  const unused = await api("product", {
    code: "QA-DEL-U",
    name: "QA unused product",
    category: "Service",
    unit: "service",
    retail: "12",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete QA unused product", exact: true })
    .click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  const after = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  assert.equal(
    after.products.some((x: any) => x.id === unused.id),
    false,
  );
  assert.equal(
    after.documents.some((x: any) => x.id === draft.id),
    false,
  );
  assert.deepEqual(after.report, before.report);
  assert.deepEqual(after.stock, before.stock);
  assert.ok(after.audit.some((x: any) => x.action === "delete"));
  console.log(
    "PASS: POS delete item/cancel/clear order, saved draft delete, unused product delete and audit; stock and accounts preserved.",
  );
}
