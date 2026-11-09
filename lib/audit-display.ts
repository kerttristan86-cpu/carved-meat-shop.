import { php, qty } from "./money";
type R = Record<string, any>;
const labels: Record<string, string> = {
  delete: "Record deleted",
  sale: "Sale completed",
  draft: "Draft saved",
  product: "Product saved",
  party: "Customer / supplier added",
  location: "Location added",
  purchase: "Purchase order created",
  receive: "Stock received",
  restock: "Product restocked",
  transfer: "Stock transferred",
  adjust: "Stock adjusted",
  payment: "Customer payment recorded",
  supplierPayment: "Supplier payment recorded",
  return: "Sale returned",
  expense: "Expense recorded",
  funds: "Owner funds recorded",
  settings: "Settings updated",
  invoiceLink: "Official invoice linked",
};
export function auditDisplay(a: R, shop: R) {
  const input = a.data?.input || {},
    result = a.data?.result || {};
  const document = (shop.documents || []).find((d: R) => d.id === result.id);
  const removed = a.action === "delete" ? result.record : null;
  const data = removed?.data || document?.data || result;
  const reference = removed?.number || document?.number || result.number;
  const formattedReference = reference
    ? `${data.shop?.prefix || shop.settings?.prefix || "CV"}-${String(reference).padStart(6, "0")}`
    : "";
  const details: [string, string][] = [];
  const add = (label: string, value: any) => {
    if (value !== undefined && value !== null && value !== "")
      details.push([label, String(value)]);
  };
  const name = (collection: string, id: any) =>
    (shop[collection] || []).find((r: R) => r.id === id)?.name;
  add(
    "Product",
    name("products", input.productId) ||
      (a.action === "product" ? input.name : undefined),
  );
  add(
    "Name",
    a.action === "party" || a.action === "location" ? input.name : undefined,
  );
  if (removed) {
    add("Deleted record", removed.name || removed.code || removed.kind);
    add("Record type", input.entity);
  }
  add("Type", input.kind);
  add("Category", input.category);
  if (a.action === "product") {
    add(
      "Product code",
      input.code ||
        (shop.products || []).find((p: R) => p.id === result.id)?.code,
    );
    for (const [key, label] of [
      ["retail", "Retail price"],
      ["bulk", "Bulk price"],
      ["box", "Box price"],
    ])
      if (input[key] != null && input[key] !== "")
        add(label, `PHP ${input[key]}`);
    if (input.lowStock != null)
      add("Low stock threshold", `${input.lowStock} kg`);
  }
  if (a.action === "settings") {
    add("Shop name", input.name);
    add("Address", input.address);
    add("Contact", input.contact);
    add("Receipt heading", input.heading);
    add("Receipt footer", input.footer);
  }
  add(
    "Customer / supplier",
    name("parties", input.partyId || document?.party_id),
  );
  add("Location", name("locations", input.locationId));
  add("From", name("locations", input.from));
  add("To", name("locations", input.to));
  if (input.quantity != null) add("Quantity", `${input.quantity} kg`);
  for (const [key, label] of [
    ["total", "Total"],
    ["paid", "Paid at checkout"],
    ["tendered", "Cash tendered"],
    ["change", "Change"],
    ["amount", "Amount"],
    ["refund", "Refund"],
    ["credit", "Credit applied"],
  ]) {
    if (typeof data[key] === "number") add(label, php(data[key]));
  }
  if (data.amount == null && input.amount != null)
    add("Amount", `PHP ${input.amount}`);
  if (input.cost != null) add("Unit cost", `PHP ${input.cost}`);
  add("Reference", input.reference);
  add("Official invoice", input.invoiceNumber);
  add("Invoice date", input.invoiceDate);
  if (input.invoiceAmount != null)
    add("Invoice amount", `PHP ${input.invoiceAmount}`);
  add("Payee", input.payee);
  add("Account", input.paymentAccount || input.account);
  add("Reason", input.reason);
  add("Notes", input.notes);
  const linked = (shop.documents || []).find(
    (d: R) => d.id === (input.documentId || input.saleId || input.orderId),
  );
  if (linked)
    add(
      "Related document",
      `${linked.data.shop?.prefix || shop.settings?.prefix || "CV"}-${String(linked.number).padStart(6, "0")}`,
    );
  const lines = (Array.isArray(data.lines) ? data.lines : []).map((l: R) => ({
    name: l.name || name("products", l.productId) || "Product",
    quantity:
      typeof l.quantity === "number"
        ? `${qty(l.quantity)} ${l.unit === "service" ? l.serviceUnit || "units" : "kg"}`
        : String(l.quantity || ""),
    price:
      typeof l.price === "number"
        ? php(l.price)
        : typeof l.cost === "number"
          ? php(l.cost)
          : "",
    amount: typeof l.amount === "number" ? php(l.amount) : "",
    tier: l.tier ? String(l.tier).replace(/^./, (c) => c.toUpperCase()) : "",
  }));
  return {
    action:
      labels[a.action] ||
      String(a.action || "Record saved")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
    reference: formattedReference,
    details,
    lines,
  };
}
