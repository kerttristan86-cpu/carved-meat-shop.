import { test } from "node:test";
import assert from "node:assert/strict";
import { auditDisplay } from "../lib/audit-display";

test("sale audit displays historical product names, pesos and kilograms instead of raw IDs", () => {
  const row = auditDisplay(
    {
      action: "sale",
      data: {
        input: { locationId: "storage" },
        result: {
          number: 75,
          shop: { prefix: "CV" },
          total: 47000,
          tendered: 50000,
          change: 3000,
          lines: [
            {
              name: "Pork Head",
              quantity: 1000,
              unit: "kg",
              price: 16000,
              amount: 16000,
              tier: "retail",
            },
          ],
        },
      },
    },
    { locations: [{ id: "storage", name: "Main storage" }] },
  );
  assert.equal(row.action, "Sale completed");
  assert.equal(row.reference, "CV-000075");
  assert.ok(
    row.details.some(
      ([key, value]) => key === "Total" && value.includes("470.00"),
    ),
  );
  assert.ok(
    row.details.some(
      ([key, value]) => key === "Location" && value === "Main storage",
    ),
  );
  assert.equal(row.lines[0].quantity, "1.000 kg");
  assert.equal(row.lines[0].name, "Pork Head");
  assert.ok(!JSON.stringify(row).includes('"storage"'));
});

test("unknown and empty audit payloads stay readable without dumping raw data", () => {
  const row = auditDisplay(
    { action: "futureAction", data: { input: { secret: "do not display" } } },
    {},
  );
  assert.equal(row.action, "Future action");
  assert.ok(!JSON.stringify(row).includes("do not display"));
  assert.doesNotThrow(() =>
    auditDisplay({ action: "payment", data: null }, {}),
  );
});
