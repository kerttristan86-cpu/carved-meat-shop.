import assert from "node:assert/strict";
import type { Page, BrowserContext } from "@playwright/test";
export async function verifyDeletion(page: Page, context: BrowserContext) {
  const before = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  const result = await context.request.post("http://127.0.0.1:3100/api/shop", {
    data: {
      action: "product",
      key: "product-delete-qa",
      data: {
        code: "QA-DEL-U",
        name: "QA unused product",
        category: "Service",
        unit: "service",
        retail: "12",
      },
    },
    headers: { origin: "http://127.0.0.1:3100" },
  });
  assert.ok(result.ok());
  const product = await result.json();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sales / POS", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Delete current order", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: /QA-DEL-U/ }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  assert.equal(await page.locator(".cart-line").count(), 1);
  const remove = page.getByRole("button", {
    name: "Delete product QA unused product",
    exact: true,
  });
  await remove.click();
  const confirm = page.getByRole("dialog", {
    name: "Confirm deletion",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(await remove.count(), 1);
  assert.equal(await page.locator(".cart-line").count(), 1);
  await remove.click();
  await page.screenshot({
    path: "test-results/delete-product-confirmation.png",
  });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(await remove.count(), 0);
  assert.equal(await page.locator(".cart-line").count(), 0);
  await page.getByRole("button", { name: "Products", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Delete QA unused product", exact: true })
      .count(),
    0,
  );
  const after = await (
    await context.request.get("http://127.0.0.1:3100/api/shop")
  ).json();
  assert.equal(
    after.products.some((x: any) => x.id === product.id),
    false,
  );
  assert.deepEqual(after.report, before.report);
  assert.deepEqual(after.stock, before.stock);
  assert.ok(
    after.audit.some(
      (x: any) => x.action === "delete" && x.data.result.id === product.id,
    ),
  );
  assert.deepEqual(after.documents, before.documents);
  console.log(
    "PASS: product delete confirmation/cancel, catalog removal and audit; no unrelated delete controls or changes to saved transactions.",
  );
}
