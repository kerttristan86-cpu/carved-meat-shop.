import { Package } from "lucide-react";
import { qty } from "../../lib/money";
import { Empty, Pill, date } from "./shared";
type R = Record<string, any>;

export default function MovementTable({
  items,
  productName,
  locName,
}: {
  items: R[];
  productName: (s: string) => string;
  locName: (s: string) => string;
}) {
  return items.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>Location</th>
            <th>Movement</th>
            <th>Weight kg</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td>{date(m.created_at)}</td>
              <td>
                <strong>{productName(m.product_id)}</strong>
              </td>
              <td>{locName(m.location_id)}</td>
              <td>
                <Pill>{m.kind}</Pill>
              </td>
              <td className="numeric">
                {Number(m.quantity) > 0 ? "+" : ""}
                {qty(Number(m.quantity))}
              </td>
              <td>{m.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>No stock movements yet.</Empty>
  );
}
