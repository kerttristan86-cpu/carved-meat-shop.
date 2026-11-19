import { z } from "zod";
import type { Queryable } from "./postgres";
export async function deleteUnusedRecord(
  tx: Queryable,
  input: Record<string, any>,
) {
  if (input.entity !== "product")
    throw new Error("Deletion is available for products only.");
  const entity = "product",
    key = z.string().trim().min(1).max(200).parse(input.id);
  z.string().trim().min(1).max(200).parse(input.reason);
  const record = (await tx.query("SELECT * FROM products WHERE id=$1", [key]))
    .rows[0] as Record<string, any> | undefined;
  if (!record) throw new Error("Product not found. Refresh the catalog.");
  const exists = async (sql: string) =>
    Boolean((await tx.query(sql, [key])).rows.length);

  if (
    (await exists("SELECT id FROM movements WHERE product_id=$1 LIMIT 1")) ||
    (await exists(
      "SELECT id FROM documents WHERE data->>'productId'=$1 OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'lines','[]'::jsonb)) AS line WHERE line->>'productId'=$1) LIMIT 1",
    ))
  )
    throw new Error(
      "This product has history or is referenced by a draft. Set it inactive in Edit instead.",
    );
  if (
    (await exists(
      "SELECT product_id FROM stock WHERE product_id=$1 AND quantity<>0",
    )) ||
    (await exists(
      "SELECT product_id FROM valuation WHERE product_id=$1 AND (quantity<>0 OR value<>0)",
    ))
  )
    throw new Error("A product with stock cannot be deleted.");
  await tx.query("DELETE FROM stock WHERE product_id=$1", [key]);
  await tx.query("DELETE FROM valuation WHERE product_id=$1", [key]);

  await tx.query("DELETE FROM products WHERE id=$1", [key]);
  return { id: key, entity, deleted: true, record };
}
