import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

test("API validation errors use readable instructions rather than a raw Zod issue array", async () => {
  const { shopErrorMessage } = await import("../lib/shop-errors");
  const result = z.number().int().safeParse(1.25);
  assert.equal(result.success, false);
  if (!result.success) {
    const message = shopErrorMessage(result.error);
    assert.match(message, /whole number/i);
    assert.ok(!message.includes("invalid_type"));
    assert.ok(!message.includes("safeint"));
  }
  assert.equal(
    shopErrorMessage(
      new Error("duplicate key value violates unique constraint"),
    ),
    "This code or name already exists",
  );
  assert.equal(
    shopErrorMessage(new Error("Insufficient stock at selected location")),
    "Insufficient stock at selected location",
  );
});
