type R = Record<string, any>;
export const manilaDay = (v: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));
export function latestInvoiceLinks(documents: R[]) {
  const links = new Map<string, R>();
  for (const d of documents
    .filter((d) => d.kind === "invoiceLink")
    .sort((a, b) => Number(b.number) - Number(a.number)))
    if (!links.has(d.data.saleId)) links.set(d.data.saleId, d);
  return links;
}
export function reconcileMonth(documents: R[], month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month");
  const links = latestInvoiceLinks(documents);
  const sales: R[] = documents
    .filter(
      (d) => d.kind === "sale" && manilaDay(d.created_at).startsWith(month),
    )
    .map((d) => {
      const link = links.get(d.id);
      return {
        ...d,
        link,
        status: !link
          ? "Unmatched"
          : link.data.invoiceAmount !== d.data.total
            ? "Amount needs review"
            : "Linked",
      };
    });
  const returns = documents.filter(
    (d) => d.kind === "return" && manilaDay(d.created_at).startsWith(month),
  );
  const gross = sales.reduce((s, d) => s + d.data.total, 0),
    returned = returns.reduce((s, d) => s + d.data.total, 0);
  const crossPeriodLinks = [...links.values()].filter(
    (l) =>
      l.data.invoiceDate.startsWith(month) &&
      !sales.some((s) => s.id === l.data.saleId),
  );
  return {
    sales,
    returns,
    crossPeriodLinks,
    gross,
    returned,
    net: gross - returned,
    unmatched: sales.filter((d) => d.status === "Unmatched").length,
    review: sales.filter((d) => d.status === "Amount needs review").length,
    links,
  };
}
