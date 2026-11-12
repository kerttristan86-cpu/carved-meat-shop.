export function parseFulfillment(mode: unknown, details?: unknown) {
  const fulfillment = mode == null ? "walkin" : mode;
  if (fulfillment !== "walkin" && fulfillment !== "delivery")
    throw new Error("Select Walk-in or Delivery.");
  if (fulfillment === "walkin") return { fulfillment: "walkin" as const };
  const source = (
    details && typeof details === "object" ? details : {}
  ) as Record<string, unknown>;
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
      recipient: field("recipient", "recipient", 200),
      contact: field("contact", "contact number", 60),
      address: field("address", "address", 500),
      notes: field("notes", "notes", 500, false),
    },
  };
}
