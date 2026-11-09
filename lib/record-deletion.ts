import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Queryable } from "./postgres";
export async function deleteUnusedRecord(
  tx: Queryable,
  input: Record<string, any>,
) {
  const entity = z
    .enum(["product", "party", "location", "document"])
    .parse(input.entity);
  const key = z.string().trim().min(1).max(200).parse(input.id);
  z.string().trim().min(1).max(200).parse(input.reason);
  const table = {
    product: "products",
    party: "parties",
    location: "locations",
    document: "documents",
  }[entity];
  const record = (await tx.query(`SELECT * FROM ${table} WHERE id=$1`, [key]))
    .rows[0] as Record<string, any> | undefined;
  if (!record)
    throw new Error("Record not found. Refresh the list and try again.");
  const exists = async (sql: string) =>
    Boolean((await tx.query(sql, [key])).rows.length);
  if (entity === "product") {
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
  } else if (entity === "party") {
    if (await exists("SELECT id FROM documents WHERE party_id=$1 LIMIT 1"))
      throw new Error(
        "This contact has transaction history and cannot be deleted.",
      );
  } else if (entity === "location") {
    if (key === "storage" || key === "freezer")
      throw new Error("A default location cannot be deleted.");
    if (
      (await exists("SELECT id FROM movements WHERE location_id=$1 LIMIT 1")) ||
      (await exists(
        "SELECT id FROM documents WHERE data->>'locationId'=$1 OR data->>'fromId'=$1 OR data->>'toId'=$1 LIMIT 1",
      ))
    )
      throw new Error("This location has history and cannot be deleted.");
    if (
      await exists(
        "SELECT product_id FROM stock WHERE location_id=$1 AND quantity<>0",
      )
    )
      throw new Error("Move this location's stock before deleting it.");
    await tx.query("DELETE FROM stock WHERE location_id=$1", [key]);
  } else {
    if (!["draft", "purchase"].includes(record.kind))
      throw new Error(
        "Posted transactions cannot be deleted. Use a linked return or reversal to keep stock and accounts correct.",
      );
    if (
      (await exists(
        "SELECT id FROM documents WHERE id<>$1 AND (data->>'draftId'=$1 OR data->>'orderId'=$1 OR data->>'documentId'=$1 OR data->>'saleId'=$1) LIMIT 1",
      )) ||
      (await exists("SELECT id FROM movements WHERE document_id=$1 LIMIT 1")) ||
      (await exists("SELECT id FROM journals WHERE document_id=$1 LIMIT 1"))
    )
      throw new Error(
        "This record is linked to posted transactions and cannot be deleted.",
      );
  }
  if (entity === "document") {
    if (
      await exists(
        "SELECT id FROM documents WHERE kind='recordDeletion' AND data->>'targetId'=$1 LIMIT 1",
      )
    )
      throw new Error("This record was already deleted. Refresh the list.");
    // Posted document rows stay immutable; deleting an unused draft/order records a tombstone.
    await tx.query(
      "INSERT INTO documents(id,kind,data) VALUES($1,'recordDeletion',$2)",
      [randomUUID(), JSON.stringify({ targetId: key, reason: input.reason })],
    );
  } else await tx.query(`DELETE FROM ${table} WHERE id=$1`, [key]);
  return { id: key, entity, deleted: true, record };
}
