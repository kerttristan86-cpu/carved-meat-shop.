import { validateWeightEntries } from "./weight-entries";
import { deleteUnusedRecord } from "./record-deletion";
import { createHash, randomUUID } from "node:crypto";
import { readTransaction, type Database, type Queryable } from "./postgres";
import { z } from "zod";
import { money, quantity, prorate, boxCount } from "./money";
import { requireStock } from "./stock-validation";
import { latestInvoiceLinks } from "./invoice-reconciliation";
type DB = Queryable;
type Row = Record<string, any>;
const text = (v: unknown, max = 200) =>
  z.string().trim().min(1).max(max).parse(v);
const positive = (v: number) => {
  if (v <= 0) throw new Error("Amount or quantity must be greater than zero");
  return v;
};
const id = () => randomUUID();
async function rows(db: DB, sql: string, args: any[] = []): Promise<Row[]> {
  return (await db.query(sql, args)).rows as Row[];
}
async function one(db: DB, sql: string, args: any[] = []) {
  const r = (await rows(db, sql, args))[0];
  if (!r) throw new Error("Record not found");
  return r;
}
async function doc(db: DB, key: string, kind?: string) {
  const d = await one(db, "SELECT * FROM documents WHERE id=$1", [key]);
  if (
    (
      await rows(
        db,
        "SELECT id FROM documents WHERE kind='recordDeletion' AND data->>'targetId'=$1 LIMIT 1",
        [key],
      )
    ).length
  )
    throw new Error("This record was deleted. Refresh the list.");
  if (kind && d.kind !== kind) throw new Error("Wrong document type");
  return d;
}
async function insertDoc(db: DB, kind: string, data: Row, partyId?: string) {
  const key = id();
  return await one(
    db,
    "INSERT INTO documents(id,kind,party_id,data) VALUES($1,$2,$3,$4) RETURNING *",
    [key, kind, partyId || null, JSON.stringify(data)],
  );
}
async function journal(
  db: DB,
  documentId: string,
  memo: string,
  entries: { account: string; debit?: number; credit?: number }[],
) {
  const debit = entries.reduce((s, e) => s + (e.debit || 0), 0),
    credit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  if (
    debit !== credit ||
    entries.some(
      (e) =>
        !Number.isSafeInteger(e.debit || e.credit || 0) ||
        (e.debit || 0) < 0 ||
        (e.credit || 0) < 0,
    )
  )
    throw new Error("Unbalanced or invalid journal");
  await db.query(
    "INSERT INTO journals(id,document_id,memo,data) VALUES($1,$2,$3,$4)",
    [id(), documentId, memo, JSON.stringify(entries)],
  );
}
async function movement(
  db: DB,
  p: string,
  l: string,
  q: number,
  value: number,
  kind: string,
  d: string,
  reason: string,
  actor: string,
) {
  const current = (
    await rows(
      db,
      "SELECT quantity FROM stock WHERE product_id=$1 AND location_id=$2",
      [p, l],
    )
  )[0];
  const balance = Number(current?.quantity || 0) + q;
  if (balance < 0) throw new Error("Insufficient stock at selected location");
  await db.query(
    "INSERT INTO stock VALUES($1,$2,$3) ON CONFLICT(product_id,location_id) DO UPDATE SET quantity=$3",
    [p, l, balance],
  );
  await db.query(
    "INSERT INTO movements VALUES($1,now(),$2,$3,$4,$5,$6,$7,$8,$9)",
    [id(), p, l, q, value, kind, d, reason, actor],
  );
}
async function valueChange(db: DB, p: string, q: number, value: number) {
  const old = (
    await rows(db, "SELECT * FROM valuation WHERE product_id=$1", [p])
  )[0];
  const nq = Number(old?.quantity || 0) + q,
    nv = Number(old?.value || 0) + value;
  if (nq < 0 || nv < 0) throw new Error("Invalid inventory valuation");
  await db.query(
    "INSERT INTO valuation VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET quantity=$2,value=$3",
    [p, nq, nv],
  );
}
async function costOut(db: DB, p: string, q: number) {
  const v = await one(db, "SELECT * FROM valuation WHERE product_id=$1", [p]);
  if (q > Number(v.quantity)) throw new Error("Insufficient total stock");
  return prorate(Number(v.value), q, Number(v.quantity));
}
async function ensureParty(db: DB, key: string | undefined, kind: string) {
  if (key) {
    const p = await one(db, "SELECT * FROM parties WHERE id=$1", [key]);
    if (p.kind !== kind) throw new Error(`Select a ${kind}`);
  }
}
function list(v: unknown): Row[] {
  return z.array(z.record(z.string(), z.any())).min(1).max(100).parse(v);
}

export async function execute(
  db: Database,
  action: string,
  input: Row,
  key: string,
  actor: string,
): Promise<Row> {
  text(key, 150);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ action, input }))
    .digest("hex");
  return db.transaction(async (tx) => {
    const old = (
      await rows(tx, "SELECT * FROM requests WHERE key=$1", [key])
    )[0];
    if (old) {
      if (old.fingerprint !== fingerprint)
        throw new Error("Retry key already belongs to different input");
      return old.result;
    }
    let result: Row;
    if (action === "delete") {
      result = await deleteUnusedRecord(tx, input);
    } else if (action === "product") {
      const unit = z.enum(["kg", "service"]).parse(input.unit);
      const prices: Row = {};
      for (const tier of ["retail", "bulk", "box"])
        prices[tier] =
          input[tier] === undefined || input[tier] === ""
            ? null
            : positive(money(input[tier]));
      const data = {
        brand: String(input.brand || "").slice(0, 100),
        cut: String(input.cut || "").slice(0, 100),
        prices,
        lowStock: quantity(input.lowStock || "0"),
        active: input.active !== false,
        serviceUnit:
          unit === "service" ? text(input.serviceUnit || "unit") : null,
      };
      const pid = input.id || id();
      let code =
        input.code == null ? "" : z.string().trim().max(40).parse(input.code);
      if (input.id) {
        const oldp = await one(tx, "SELECT * FROM products WHERE id=$1", [pid]);
        if (!code) code = oldp.code;
        if (oldp.unit !== unit)
          throw new Error("Inventory unit cannot change; create a new product");
      }
      while (!code) {
        const next = await one(
          tx,
          "SELECT nextval('product_code_sequence') AS number",
        );
        const candidate = "P" + String(next.number).padStart(6, "0");
        if (
          !(
            await rows(tx, "SELECT id FROM products WHERE code=$1", [candidate])
          ).length
        )
          code = candidate;
      }
      await tx.query(
        "INSERT INTO products VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET code=$2,name=$3,category=$4,data=$6",
        [
          pid,
          code,
          text(input.name),
          text(input.category, 80),
          unit,
          JSON.stringify(data),
        ],
      );
      result = { id: pid, code };
    } else if (action === "party") {
      const pid = id();
      await tx.query("INSERT INTO parties VALUES($1,$2,$3,$4)", [
        pid,
        text(input.name),
        z.enum(["customer", "supplier"]).parse(input.kind),
        JSON.stringify({
          contact: String(input.contact || "").slice(0, 200),
          address: String(input.address || "").slice(0, 500),
        }),
      ]);
      result = { id: pid };
    } else if (action === "location") {
      const lid = id();
      await tx.query("INSERT INTO locations VALUES($1,$2)", [
        lid,
        text(input.name),
      ]);
      result = { id: lid };
    } else if (action === "restock") {
      const p = await one(tx, "SELECT * FROM products WHERE id=$1", [
        input.productId,
      ]);
      if (p.unit !== "kg")
        throw new Error("Only physical products can be restocked");
      if (!input.partyId) throw new Error("Choose a supplier");
      await ensureParty(tx, input.partyId, "supplier");
      const locationId = text(input.locationId),
        q = positive(quantity(input.quantity)),
        cost = positive(money(input.cost)),
        total = prorate(cost, q, 1000);
      const line = {
        productId: p.id,
        name: p.name,
        quantity: q,
        cost,
        boxes: 0,
      };
      const order = await insertDoc(
        tx,
        "purchase",
        {
          lines: [line],
          reference: String(input.reference || "Quick restock").slice(0, 150),
        },
        input.partyId,
      );
      const receipt = await insertDoc(
        tx,
        "receive",
        {
          orderId: order.id,
          locationId,
          lines: [{ ...line, index: 0, value: total }],
          total,
        },
        input.partyId,
      );
      await movement(
        tx,
        p.id,
        locationId,
        q,
        total,
        "receive",
        receipt.id,
        "Product restock",
        actor,
      );
      await valueChange(tx, p.id, q, total);
      await journal(tx, receipt.id, "Product restock", [
        { account: "Inventory", debit: total },
        { account: "Accounts payable", credit: total },
      ]);
      result = { id: receipt.id, orderId: order.id, total };
    } else if (action === "purchase") {
      await ensureParty(tx, input.partyId, "supplier");
      if (!input.partyId) throw new Error("Supplier required");
      const lines = [];
      for (const l of list(input.lines)) {
        const p = await one(tx, "SELECT * FROM products WHERE id=$1", [
          l.productId,
        ]);
        if (p.unit !== "kg")
          throw new Error("Only stock products can be purchased");
        lines.push({
          productId: p.id,
          name: p.name,
          quantity: positive(quantity(l.quantity)),
          cost: positive(money(l.cost)),
          boxes: boxCount(l.boxes),
        });
      }
      const d = await insertDoc(
        tx,
        "purchase",
        { lines, reference: String(input.reference || "").slice(0, 150) },
        input.partyId,
      );
      result = { id: d.id };
    } else if (action === "receive") {
      const order = await doc(tx, input.orderId, "purchase");
      const previous = await rows(
        tx,
        "SELECT data FROM documents WHERE kind='receive' AND data->>'orderId'=$1",
        [order.id],
      );
      const received = new Map<number, number>();
      const receivedValue = new Map<number, number>();
      for (const d of previous)
        for (const l of d.data.lines) {
          received.set(l.index, (received.get(l.index) || 0) + l.quantity);
          receivedValue.set(
            l.index,
            (receivedValue.get(l.index) || 0) + l.value,
          );
        }
      const lines = [];
      let total = 0;
      for (const l of list(input.lines)) {
        const index = z.number().int().min(0).parse(l.index);
        const original = order.data.lines[index];
        if (!original) throw new Error("Invalid purchase line");
        const q = positive(quantity(l.quantity));
        const sum = (received.get(index) || 0) + q;
        if (sum > original.quantity)
          throw new Error("Receiving exceeds ordered quantity");
        received.set(index, sum);
        // Allocate the cumulative rounded entitlement so splitting deliveries
        // cannot change the final inventory cost or supplier payable.
        const value =
          prorate(original.cost, sum, 1000) - (receivedValue.get(index) || 0);
        receivedValue.set(index, (receivedValue.get(index) || 0) + value);
        total += value;
        lines.push({
          ...original,
          index,
          quantity: q,
          value,
          boxes: boxCount(l.boxes),
        });
      }
      const d = await insertDoc(
        tx,
        "receive",
        { orderId: order.id, locationId: text(input.locationId), lines, total },
        order.party_id,
      );
      for (const l of lines) {
        await movement(
          tx,
          l.productId,
          input.locationId,
          l.quantity,
          l.value,
          "receive",
          d.id,
          "Supplier receipt",
          actor,
        );
        await valueChange(tx, l.productId, l.quantity, l.value);
      }
      await journal(tx, d.id, "Purchase receipt", [
        { account: "Inventory", debit: total },
        { account: "Accounts payable", credit: total },
      ]);
      result = { id: d.id, total };
    } else if (action === "transfer") {
      const q = positive(quantity(input.quantity));
      if (input.from === input.to)
        throw new Error("Choose different locations");
      const reason = text(input.reason);
      const d = await insertDoc(tx, "transfer", { ...input, quantity: q });
      await movement(
        tx,
        input.productId,
        input.from,
        -q,
        0,
        "transfer",
        d.id,
        reason,
        actor,
      );
      await movement(
        tx,
        input.productId,
        input.to,
        q,
        0,
        "transfer",
        d.id,
        reason,
        actor,
      );
      result = { id: d.id };
    } else if (action === "adjust") {
      const p = await one(tx, "SELECT * FROM products WHERE id=$1", [
        input.productId,
      ]);
      if (p.unit !== "kg") throw new Error("Service items have no stock");
      const kind = z
        .enum(["opening", "count", "spoilage", "adjustment"])
        .parse(input.kind);
      const reason = text(input.reason);
      const current = Number(
        (
          await rows(
            tx,
            "SELECT quantity FROM stock WHERE product_id=$1 AND location_id=$2",
            [p.id, input.locationId],
          )
        )[0]?.quantity || 0,
      );
      if (
        kind === "opening" &&
        (
          await rows(
            tx,
            "SELECT id FROM movements WHERE product_id=$1 LIMIT 1",
            [p.id],
          )
        ).length
      )
        throw new Error(
          "Opening inventory is only available before any movements for this product",
        );
      const q =
        kind === "count" || kind === "opening"
          ? quantity(input.quantity) - current
          : kind === "spoilage"
            ? -positive(quantity(input.quantity))
            : quantity(input.quantity);
      if (q === 0) throw new Error("No stock change");
      const value =
        q > 0
          ? prorate(positive(money(input.cost)), q, 1000)
          : -(await costOut(tx, p.id, -q));
      const d = await insertDoc(tx, "adjustment", {
        ...input,
        quantity: q,
        value,
      });
      await movement(
        tx,
        p.id,
        input.locationId,
        q,
        value,
        kind,
        d.id,
        reason,
        actor,
      );
      await valueChange(tx, p.id, q, value);
      await journal(
        tx,
        d.id,
        reason,
        value > 0
          ? [
              { account: "Inventory", debit: value },
              {
                account:
                  kind === "opening" ? "Opening equity" : "Inventory variance",
                credit: value,
              },
            ]
          : [
              {
                account:
                  kind === "spoilage" ? "Spoilage" : "Inventory variance",
                debit: -value,
              },
              { account: "Inventory", credit: -value },
            ],
      );
      result = { id: d.id };
    } else if (action === "draft" || action === "sale") {
      await ensureParty(tx, input.partyId, "customer");
      const lines = [];
      const reserved = new Map<string, number>();
      let total = 0,
        cogs = 0;
      for (const l of list(input.lines)) {
        const p = await one(tx, "SELECT * FROM products WHERE id=$1", [
          l.productId,
        ]);
        if (!p.data.active) throw new Error("Product is inactive");
        const q = positive(quantity(l.quantity)),
          tier = z.enum(["retail", "bulk", "box"]).parse(l.tier);
        const batch =
          l.weightEntries === undefined
            ? undefined
            : validateWeightEntries(l.weightEntries, l.quantity);
        if (batch && p.unit !== "kg")
          throw new Error("Multiple weights are for kg products only.");
        if (
          batch &&
          tier === "box" &&
          l.boxes != null &&
          boxCount(l.boxes) !== batch.boxes
        )
          throw new Error("Box count must match the number of weights.");
        const price = p.data.prices[tier];
        if (price === null || price === undefined)
          throw new Error(`${p.name}: selected price is unavailable`);
        if (l.expectedPrice !== undefined && l.expectedPrice !== price)
          throw new Error(
            `${p.name}: price changed. Remove this cart line and add it again to confirm the current price.`,
          );
        if (
          tier === "bulk" &&
          q < 5000 &&
          !String(l.overrideReason || "").trim()
        )
          throw new Error(
            "5 KG UP requires at least 5 kg per line or an override reason",
          );
        const amount = prorate(price, q, 1000);
        if (action === "sale" && p.unit === "kg") {
          const stock = (
            await rows(
              tx,
              "SELECT quantity FROM stock WHERE product_id=$1 AND location_id=$2",
              [p.id, input.locationId],
            )
          )[0];
          const location = await one(
            tx,
            "SELECT name FROM locations WHERE id=$1",
            [input.locationId],
          );
          const requested = (reserved.get(p.id) || 0) + q;
          requireStock(
            p.name,
            location.name,
            Number(stock?.quantity || 0),
            requested,
          );
          reserved.set(p.id, requested);
        }
        total += amount;
        const cost =
          action === "sale" && p.unit === "kg" ? await costOut(tx, p.id, q) : 0;
        const line = {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          serviceUnit: p.data.serviceUnit,
          quantity: q,
          tier,
          price,
          amount,
          cost,
          boxes: tier === "box" ? (batch?.boxes ?? boxCount(l.boxes)) : 0,
          weightEntries: batch?.grams,
          overrideReason: String(l.overrideReason || "").slice(0, 300),
        };
        lines.push(line);
        cogs += cost;
        // Reserve in this transaction immediately so repeated product lines cannot oversell.
        if (action === "sale" && p.unit === "kg") {
          await valueChange(tx, p.id, -q, -cost);
        }
      }
      const tendered = action === "sale" ? money(input.tendered || "0") : 0,
        paid = Math.min(tendered, total),
        change = Math.max(0, tendered - total);
      if (action === "sale" && paid < total && !input.partyId)
        throw new Error("Choose a customer for an unpaid balance");
      if (input.draftId) {
        const draft = await doc(tx, input.draftId, "draft");
        const posted = await rows(
          tx,
          "SELECT id FROM documents WHERE kind='sale' AND data->>'draftId'=$1",
          [draft.id],
        );
        if (posted.length) throw new Error("Draft already posted");
      }
      const shop = (await one(tx, "SELECT data FROM settings WHERE id='shop'"))
        .data;
      const data = {
        lines,
        total,
        cogs,
        tendered,
        paid,
        change,
        locationId: text(input.locationId),
        draftId: input.draftId || null,
        shop,
        actor,
      };
      const d = await insertDoc(tx, action, data, input.partyId);
      if (action === "sale") {
        for (const l of lines)
          if (l.unit === "kg")
            await movement(
              tx,
              l.productId,
              input.locationId,
              -l.quantity,
              -l.cost,
              "sale",
              d.id,
              "Posted sale",
              actor,
            );
        await journal(tx, d.id, "Sale posted", [
          { account: "Accounts receivable", debit: total },
          { account: "Sales revenue", credit: total },
          { account: "Cost of goods sold", debit: cogs },
          { account: "Inventory", credit: cogs },
        ]);
        if (paid)
          await journal(tx, d.id, "Checkout payment", [
            { account: "Cash", debit: paid },
            { account: "Accounts receivable", credit: paid },
          ]);
      }
      result = {
        id: d.id,
        number: d.number,
        created_at: d.created_at,
        ...data,
      };
    } else if (action === "payment" || action === "supplierPayment") {
      const d = await doc(
        tx,
        input.documentId,
        action === "payment" ? "sale" : "purchase",
      );
      const amount = positive(money(input.amount));
      const related = await rows(tx, "SELECT kind,data FROM documents");
      let balance = 0;
      if (action === "payment")
        balance =
          d.data.total -
          d.data.paid -
          related
            .filter((x) => x.kind === "payment" && x.data.documentId === d.id)
            .reduce((s, x) => s + x.data.amount, 0) -
          related
            .filter((x) => x.kind === "return" && x.data.saleId === d.id)
            .reduce((s, x) => s + x.data.credit, 0);
      else
        balance =
          related
            .filter((x) => x.kind === "receive" && x.data.orderId === d.id)
            .reduce((s, x) => s + x.data.total, 0) -
          related
            .filter(
              (x) => x.kind === "supplierPayment" && x.data.documentId === d.id,
            )
            .reduce((s, x) => s + x.data.amount, 0);
      if (amount > balance)
        throw new Error("Payment exceeds outstanding balance");
      const tendered =
        action === "payment" ? money(input.tendered || input.amount) : amount;
      if (tendered < amount)
        throw new Error("Tendered amount is below payment");
      const pay = await insertDoc(
        tx,
        action,
        { documentId: d.id, amount, tendered, change: tendered - amount },
        d.party_id,
      );
      await journal(
        tx,
        pay.id,
        "Balance payment",
        action === "payment"
          ? [
              { account: "Cash", debit: amount },
              { account: "Accounts receivable", credit: amount },
            ]
          : [
              { account: "Accounts payable", debit: amount },
              { account: "Cash", credit: amount },
            ],
      );
      result = { id: pay.id, change: tendered - amount };
    } else if (action === "return") {
      const sale = await doc(tx, input.saleId, "sale");
      const index = z.number().int().min(0).parse(input.index),
        l = sale.data.lines[index];
      if (!l) throw new Error("Invalid sale line");
      const q = positive(quantity(input.quantity)),
        reason = text(input.reason);
      const returns = await rows(
        tx,
        "SELECT data FROM documents WHERE kind='return' AND data->>'saleId'=$1",
        [sale.id],
      );
      const previous = returns.filter((d) => d.data.index === index);
      const returned = previous.reduce((s, d) => s + d.data.quantity, 0);
      if (returned + q > l.quantity)
        throw new Error("Return exceeds sold quantity");
      const total =
        prorate(l.amount, returned + q, l.quantity) -
        previous.reduce((s, d) => s + d.data.total, 0);
      const cost =
        prorate(l.cost, returned + q, l.quantity) -
        previous.reduce((s, d) => s + d.data.cost, 0);
      const payments = await rows(
        tx,
        "SELECT data FROM documents WHERE kind='payment' AND data->>'documentId'=$1",
        [sale.id],
      );
      const outstanding =
        sale.data.total -
        sale.data.paid -
        payments.reduce((s, d) => s + d.data.amount, 0) -
        returns.reduce((s, d) => s + d.data.credit, 0);
      const credit = Math.min(total, outstanding),
        refund = total - credit;
      const restock = z.boolean().parse(input.restock);
      const d = await insertDoc(
        tx,
        "return",
        {
          saleId: sale.id,
          index,
          quantity: q,
          total,
          cost,
          credit,
          refund,
          restock,
          reason,
        },
        sale.party_id,
      );
      const entries = [
        { account: "Sales revenue", debit: total },
        { account: "Accounts receivable", credit },
        { account: "Cash", credit: refund },
      ];
      if (l.unit === "kg" && restock) {
        await movement(
          tx,
          l.productId,
          sale.data.locationId,
          q,
          cost,
          "return",
          d.id,
          reason,
          actor,
        );
        await valueChange(tx, l.productId, q, cost);
        entries.push(
          { account: "Inventory", debit: cost },
          { account: "Cost of goods sold", credit: cost },
        );
      }
      await journal(tx, d.id, "Customer return: " + reason, entries);
      result = { id: d.id, total, refund, credit };
    } else if (action === "funds") {
      const amount = positive(money(input.amount)),
        account = z.enum(["Cash", "Bank"]).parse(input.account),
        reason = text(input.reason);
      const d = await insertDoc(tx, "funds", { amount, account, reason });
      await journal(tx, d.id, "Owner funds: " + reason, [
        { account, debit: amount },
        { account: "Owner capital", credit: amount },
      ]);
      result = { id: d.id };
    } else if (action === "expense") {
      const amount = positive(money(input.amount));
      const date = z.iso.date().parse(input.date);
      const paymentAccount = z
        .enum(["Cash", "Bank"])
        .parse(input.paymentAccount || "Cash");
      const data = {
        amount,
        date,
        paymentAccount,
        category: text(input.category, 80),
        payee: text(input.payee),
        notes: String(input.notes || "").slice(0, 1000),
      };
      const d = await insertDoc(tx, "expense", data);
      await journal(tx, d.id, "Expense: " + data.category, [
        { account: "Operating expenses", debit: amount },
        { account: paymentAccount, credit: amount },
      ]);
      result = { id: d.id };
    } else if (action === "invoiceLink") {
      const sale = await doc(tx, text(input.saleId), "sale");
      const invoiceNumber = text(input.invoiceNumber, 100),
        invoiceDate = z.iso.date().parse(input.invoiceDate),
        invoiceAmount = positive(money(input.invoiceAmount)),
        reason = text(input.reason, 500);
      const links = latestInvoiceLinks(
        await rows(
          tx,
          "SELECT * FROM documents WHERE kind='invoiceLink' ORDER BY number DESC",
        ),
      );
      const current = links.get(sale.id);
      if ((current?.id || null) !== (input.previousLinkId || null))
        throw new Error(
          "Invoice link changed. Refresh before saving your correction.",
        );
      if (
        [...links.values()].some(
          (l) =>
            l.data.saleId !== sale.id &&
            l.data.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase(),
        )
      )
        throw new Error(
          "This official invoice number is already linked to another sale.",
        );
      const d = await insertDoc(
        tx,
        "invoiceLink",
        {
          saleId: sale.id,
          invoiceNumber,
          invoiceDate,
          invoiceAmount,
          reason,
          previousLinkId: current?.id || null,
        },
        sale.party_id,
      );
      result = { id: d.id };
    } else if (action === "settings") {
      const data = {
        name: text(input.name),
        address: String(input.address || "").slice(0, 500),
        contact: String(input.contact || "").slice(0, 200),
        invoiceDetails: String(input.invoiceDetails || "").slice(0, 1000),
        heading: text(input.heading, 100),
        footer: String(input.footer || "").slice(0, 500),
        prefix: text(input.prefix, 15),
        margin: z.number().min(0).max(10).parse(input.margin),
        density: z.number().min(9).max(16).parse(input.density),
        printer: z.enum(["browser", "unconfigured"]).parse(input.printer),
        accountantReviewed: false,
      };
      await tx.query("UPDATE settings SET data=$1 WHERE id='shop'", [
        JSON.stringify(data),
      ]);
      result = data;
    } else throw new Error("Unsupported operation");
    await tx.query("INSERT INTO audit VALUES($1,now(),$2,$3,$4)", [
      id(),
      actor,
      action,
      JSON.stringify({ input, result }),
    ]);
    await tx.query("INSERT INTO requests VALUES($1,$2,$3)", [
      key,
      fingerprint,
      JSON.stringify(result),
    ]);
    return result;
  });
}

export async function snapshot(db: Database, from?: string, to?: string) {
  // One read transaction gives stock, documents and financial reports the same consistent view.
  return readTransaction(db, async (tx) => {
    const products = await rows(
        tx,
        "SELECT * FROM products ORDER BY category,name",
      ),
      parties = await rows(tx, "SELECT * FROM parties ORDER BY name"),
      locations = await rows(tx, "SELECT * FROM locations ORDER BY name"),
      documents = await rows(
        tx,
        "SELECT d.* FROM documents d WHERE NOT EXISTS (SELECT 1 FROM documents deleted WHERE deleted.kind='recordDeletion' AND deleted.data->>'targetId'=d.id) ORDER BY d.number DESC",
      );
    const movements = await rows(
        tx,
        "SELECT * FROM movements ORDER BY created_at DESC",
      ),
      audit = await rows(
        tx,
        'SELECT a.*, u.name AS operator_name FROM audit a LEFT JOIN "user" u ON u.id=a.actor ORDER BY a.created_at DESC',
      );
    const journals = await rows(
      tx,
      "SELECT * FROM journals ORDER BY created_at DESC",
    );
    const accounts: Row = {};
    const periodAccounts: Row = {};
    const inPeriod = (date: any) => {
      const day =
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date
          : new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(date));
      return (!from || day >= from) && (!to || day <= to);
    };
    for (const j of journals) {
      const source = documents.find((d) => d.id === j.document_id);
      if (source?.kind === "expense")
        j.created_at = source.data.date + "T00:00:00+08:00";
    }
    for (const j of journals) {
      j.debit = j.data.reduce((s: number, e: Row) => s + (e.debit || 0), 0);
      j.credit = j.data.reduce((s: number, e: Row) => s + (e.credit || 0), 0);
      for (const e of j.data) {
        const net = (e.debit || 0) - (e.credit || 0);
        accounts[e.account] = (accounts[e.account] || 0) + net;
        if (inPeriod(j.created_at))
          periodAccounts[e.account] = (periodAccounts[e.account] || 0) + net;
      }
    }
    const revenue = 0 - (periodAccounts["Sales revenue"] || 0),
      cogs = periodAccounts["Cost of goods sold"] || 0,
      expenses =
        (periodAccounts["Operating expenses"] || 0) +
        (periodAccounts.Spoilage || 0) +
        (periodAccounts["Inventory variance"] || 0);
    const attachments = await rows(tx, "SELECT * FROM attachments");
    const stock = (await rows(tx, "SELECT * FROM stock")).map((s) => ({
      ...s,
      quantity: Number(s.quantity),
    }));
    for (const d of documents) {
      const rel = documents.filter((x) => x.data.documentId === d.id);
      const ret = documents.filter(
        (x) => x.kind === "return" && x.data.saleId === d.id,
      );
      if (d.kind === "sale")
        d.balance =
          d.data.total -
          d.data.paid -
          rel
            .filter((x) => x.kind === "payment")
            .reduce((s, x) => s + x.data.amount, 0) -
          ret.reduce((s, x) => s + x.data.credit, 0);
      if (d.kind === "purchase") {
        d.received = documents
          .filter((x) => x.kind === "receive" && x.data.orderId === d.id)
          .reduce((s, x) => s + x.data.total, 0);
        d.balance =
          d.received -
          rel
            .filter((x) => x.kind === "supplierPayment")
            .reduce((s, x) => s + x.data.amount, 0);
      }
    }
    return {
      products,
      parties,
      locations,
      stock,
      documents,
      attachments,
      movements,
      audit,
      journals: journals.filter((j) => inPeriod(j.created_at)),
      accounts,
      periodAccounts,
      settings: (await one(tx, "SELECT data FROM settings WHERE id='shop'"))
        .data,
      report: {
        revenue,
        cogs,
        grossProfit: revenue - cogs,
        expenses,
        netProfit: revenue - cogs - expenses,
        cashMovement: periodAccounts.Cash || 0,
        cash: accounts.Cash || 0,
        inventory: accounts.Inventory || 0,
        receivables: accounts["Accounts receivable"] || 0,
        payables: -(accounts["Accounts payable"] || 0),
        balanced: journals.every((j) => j.debit === j.credit),
      },
    };
  });
}
