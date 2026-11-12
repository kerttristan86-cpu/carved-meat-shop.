import Decimal from "decimal.js";
Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
export function scaled(
  value: unknown,
  places: number,
  allowNegative = false,
): number {
  if (
    typeof value !== "string" ||
    !new RegExp(
      `^${allowNegative ? "-?" : ""}\\d{1,9}(\\.\\d{1,${places}})?$`,
    ).test(value)
  )
    throw new Error(
      `Enter a valid number with at most ${places} decimal places`,
    );
  const n = new Decimal(value).mul(10 ** places).toNumber();
  if (!Number.isSafeInteger(n))
    throw new Error("Amount exceeds supported range");
  return n;
}
export const money = (v: unknown) => scaled(v, 2);
export function normalizeQuantity(value: string) {
  return value.trim().replace(/^(?=\.\d)/, "0");
}
export const quantity = (v: unknown) =>
  scaled(typeof v === "string" ? normalizeQuantity(v) : v, 3);
export function prorate(value: number, part: number, total: number) {
  const result = new Decimal(value)
    .mul(part)
    .div(total)
    .toDecimalPlaces(0)
    .toNumber();
  if (!Number.isSafeInteger(result))
    throw new Error("Calculated amount exceeds supported range");
  return result;
}
export function lineAmount(q: string, p: string) {
  return prorate(money(p), quantity(q), 1000);
}
export const php = (c: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    c / 100,
  );
export const qty = (n: number) => (n / 1000).toFixed(3);

export function boxCount(value: unknown): number {
  const message =
    "Box count must be a whole number (0, 1, 2...). Enter decimal weight in Weight (kg).";
  if (value == null || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error(message);
  const input = typeof value === "string" ? value.trim() : value;
  if (input === "") return 0;
  if (typeof input === "string" && !/^\d+(?:\.0+)?$/.test(input))
    throw new Error(message);
  const count = Number(input);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(message);
  return count;
}
