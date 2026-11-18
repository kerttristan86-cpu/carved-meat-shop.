import { quantity, qty } from "./money";
export function validateWeightEntries(value: unknown, total?: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new Error("Enter 1 to 100 separate weights.");
  const grams = value.map((v) => {
    const n = quantity(typeof v === "string" ? v.trim() : v);
    if (n <= 0) throw new Error("Every weight must be positive.");
    return n;
  });
  const sum = grams.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum))
    throw new Error("Total weight exceeds supported range.");
  const formatted = qty(sum);
  quantity(formatted);
  if (total !== undefined && quantity(total) !== sum)
    throw new Error("The total weight must match the sum of all entries.");
  return {
    grams,
    entries: grams.map(qty),
    quantity: formatted,
    boxes: grams.length,
  };
}
export function parseWeightEntries(value: string) {
  return validateWeightEntries(
    value.trim() ? value.trim().split(/[\s,;]+/) : [],
  );
}
