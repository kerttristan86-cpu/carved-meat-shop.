import { quantity, lineAmount, boxCount } from "./money";
export function validateCartLine(line: Record<string, any>) {
  if (!Number.isSafeInteger(line.price) || line.price <= 0)
    throw new Error("Invalid product price");
  if (quantity(line.quantity) <= 0)
    throw new Error("Quantity must be greater than zero");
  lineAmount(line.quantity, (line.price / 100).toFixed(2));
  if (line.tier === "box") boxCount(line.boxes);
}
export function restoreCart(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) =>
      line && typeof line === "object" && line.tier !== "box"
        ? { ...line, boxes: 0 }
        : line,
    )
    .filter((l) => {
      try {
        if (
          !l ||
          typeof l.productId !== "string" ||
          typeof l.name !== "string" ||
          !["retail", "bulk", "box"].includes(l.tier)
        )
          return false;
        validateCartLine(l);
        return true;
      } catch {
        return false;
      }
    });
}
export function stockStatus(grams: number, threshold: number) {
  return grams === 0
    ? { label: "Out of stock", tone: "red" }
    : grams <= threshold
      ? { label: "Low stock", tone: "amber" }
      : { label: "In stock", tone: "green" };
}
export function periodStart(preset: string, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (preset === "week") {
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  }
  if (preset === "month") return day.slice(0, 7) + "-01";
  if (preset === "year") return day.slice(0, 4) + "-01-01";
  return day;
}
