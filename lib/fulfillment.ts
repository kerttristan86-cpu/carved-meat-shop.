export function parseFulfillment(mode: unknown, details?: unknown) {
  const fulfillment = mode == null ? "walkin" : mode;
  if (fulfillment !== "walkin" && fulfillment !== "delivery")
    throw new Error("Select Walk-in or Delivery.");
  if (fulfillment === "walkin") return { fulfillment: "walkin" as const };
  const source = (
    details && typeof details === "object" ? details : {}
  ) as Record<string, unknown>;
  const paymentMethod =
    source.paymentMethod == null ? "cash_now" : source.paymentMethod;
  if (paymentMethod !== "cash_now" && paymentMethod !== "cod")
    throw new Error(
      "Invalid delivery payment method. Select Cash paid now or Cash on delivery (COD).",
    );
  const field = (key: string, label: string, max: number, required = true) => {
    const value =
      typeof source[key] === "string" ? (source[key] as string).trim() : "";
    if (required && !value) throw new Error(`Delivery ${label} is required.`);
    if (value.length > max)
      throw new Error(
        `Delivery ${label} is too long (maximum ${max} characters).`,
      );
    return value;
  };
  return {
    fulfillment: "delivery" as const,
    delivery: {
      paymentMethod,
      recipient: field("recipient", "recipient", 200, false),
      contact: field("contact", "contact number", 60, false),
      address: field("address", "address", 500, false),
      notes: field("notes", "notes", 500, false),
    },
  };
}
