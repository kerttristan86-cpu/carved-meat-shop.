import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./support/test-db";
import { execute, snapshot } from "../lib/shop";
import { reconcileMonth } from "../lib/invoice-reconciliation";
test('monthly reconciliation includes prior-month returns and unmatched sales in totals',()=>{const docs=[{id:'old',kind:'sale',number:1,created_at:'2026-09-30T10:00:00Z',data:{total:1000}},{id:'new',kind:'sale',number:2,created_at:'2026-10-02T10:00:00Z',data:{total:2000}},{id:'r',kind:'return',number:3,created_at:'2026-10-03T10:00:00Z',data:{saleId:'old',total:500}},{id:'l',kind:'invoiceLink',number:4,created_at:'2026-10-03T10:00:00Z',data:{saleId:'old',invoiceNumber:'OLD',invoiceDate:'2026-10-03',invoiceAmount:1000}}];const r=reconcileMonth(docs,'2026-10');assert.equal(r.gross,2000);assert.equal(r.net,1500);assert.equal(r.unmatched,1);assert.equal(r.returns.length,1);assert.equal(r.crossPeriodLinks.length,1);});
test("invoice links retain all sales, reject duplicate references and never repost accounting", async () => {
  const db = await testDatabase();
  let n = 0;
  const run = (a: string, d: any, k?: string) =>
    execute(db, a, d, k || "link-" + ++n, "owner");
  const p = await run("product", {
    name: "Service",
    category: "Services",
    unit: "service",
    retail: "10",
  });
  const sale = await run("sale", {
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "1", tier: "retail" }],
    tendered: "10",
  });
  const other = await run("sale", {
    locationId: "freezer",
    lines: [{ productId: p.id, quantity: "2", tier: "retail" }],
    tendered: "20",
  });
  const before = await snapshot(db);
  const link = await run(
    "invoiceLink",
    {
      saleId: sale.id,
      invoiceNumber: "OFF-001",
      invoiceDate: "2026-10-30",
      invoiceAmount: "10",
      reason: "Initial link",
    },
    "same",
  );
  assert.equal(
    (
      await run(
        "invoiceLink",
        {
          saleId: sale.id,
          invoiceNumber: "OFF-001",
          invoiceDate: "2026-10-30",
          invoiceAmount: "10",
          reason: "Initial link",
        },
        "same",
      )
    ).id,
    link.id,
  );
  await assert.rejects(
    () =>
      run("invoiceLink", {
        saleId: other.id,
        invoiceNumber: "off-001",
        invoiceDate: "2026-10-30",
        invoiceAmount: "20",
        reason: "Duplicate",
      }),
    /already linked/,
  );
  await assert.rejects(
    () =>
      run("invoiceLink", {
        saleId: sale.id,
        invoiceNumber: "OFF-002",
        invoiceDate: "2026-10-30",
        invoiceAmount: "10",
        reason: "Edit without version",
      }),
    /changed/,
  );
  await run("invoiceLink", {
    saleId: sale.id,
    invoiceNumber: "OFF-002",
    invoiceDate: "2026-10-30",
    invoiceAmount: "9",
    reason: "Correct reference",
    previousLinkId: link.id,
  });
  const after = await snapshot(db);
  assert.deepEqual(after.report, before.report);
  assert.equal(after.journals.length, before.journals.length);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(sale.created_at));
  const r = reconcileMonth(after.documents, day.slice(0, 7));
  assert.equal(r.sales.length, 2);
  assert.equal(r.unmatched, 1);
  assert.equal(r.review, 1);
  assert.equal(r.gross, 3000);
  await db.close();
});
