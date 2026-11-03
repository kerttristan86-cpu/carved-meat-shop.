import { Package } from "lucide-react";
type R = Record<string, any>;
export const date = (d: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
export const number = (d: R, s: R) =>
  `${d.data.shop?.prefix || s.prefix}-${String(d.number).padStart(6, "0")}`;
export function download(name: string, rows: any[][]) {
  const csv = rows
    .map((r) =>
      r.map((c) => '"' + String(c ?? "").replaceAll('"', '""') + '"').join(","),
    )
    .join("\r\n");
  const u = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Package size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
