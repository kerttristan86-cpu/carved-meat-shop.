"use client";
import { PrinterStatus } from "./components/printer-status";
import { parseWeightEntries } from "../lib/weight-entries";
import { parseFulfillment } from "../lib/fulfillment";
import { normalizeQuantity, quantity as weightGrams } from "../lib/money";
import { Toast } from "./components/notifications";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBasket,
  Package,
  Truck,
  FileText,
  Receipt,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  LogOut,
  Printer,
  X,
  Trash2,
  Check,
  ChevronRight,
  Users,
  History,
  SlidersHorizontal,
  Scale,
} from "lucide-react";
import { php, qty, lineAmount, boxCount } from "../lib/money";
import { readJson, checkoutError } from "../lib/http";
import {
  validateCartLine,
  restoreCart,
  stockStatus,
  periodStart,
} from "../lib/ui-validation";
import MovementTable from "./components/movement-table";
import ReceiptDialog from "./components/receipt-dialog";
import PrinterConnectionSettings from "./components/printer-connection-settings";
import ReviewExport from "./components/review-export";
import InvoiceReconciliation from "./components/invoice-reconciliation";
import AuditHistory from "./components/audit-history";
import {
  date,
  number,
  download,
  Field,
  Empty,
  Pill,
  LoadingIndicator,
  LoadingOverlay,
  LoadingScreen,
  Modal,
} from "./components/shared";
type R = Record<string, any>;
const nav = [
  ["Overview", LayoutDashboard],
  ["Sales / POS", ShoppingBasket],
  ["Inventory", Package],
  ["Purchases", Truck],
  ["Invoices", FileText],
  ["Receipts", Receipt],
  ["Expenses", Wallet],
  ["Accounting", ChartNoAxesCombined],
  ["Products", SlidersHorizontal],
  ["Customers & suppliers", Users],
  ["Audit history", History],
  ["Settings", Settings],
] as const;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function Shop() {
  const [state, setState] = useState<R | null>(null),
    [login, setLogin] = useState(false),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All products"),
    [selected, setSelected] = useState<R | null>(null),
    [weight, setWeight] = useState("1.000"),
    [tier, setTier] = useState("retail"),
    [boxes, setBoxes] = useState("0"),
    [override, setOverride] = useState("");
  const [cart, setCart] = useState<R[]>([]),
    [customer, setCustomer] = useState(""),
    [location, setLocation] = useState("freezer"),
    [tendered, setTendered] = useState(""),
    [draftId, setDraftId] = useState<string | undefined>(),
    [cartReady, setCartReady] = useState(false);
  const [modal, setModal] = useState<R | null>(null),
    [receipt, setReceipt] = useState<R | null>(null),
    [attachment, setAttachment] = useState<File | null>(null),
    [form, setForm] = useState<R>({}),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [reportTab, setReportTab] = useState("Profit & loss");
  const [deletion, setDeletion] = useState<R | null>(null);
  const emptyDelivery = {
    paymentMethod: "cash_now",
    recipient: "",
    contact: "",
    address: "",
    notes: "",
  };
  const [fulfillment, setFulfillment] = useState("walkin"),
    [delivery, setDelivery] = useState<R>(emptyDelivery);
  const [multipleWeights, setMultipleWeights] = useState(false),
    [weightsText, setWeightsText] = useState("");
  const entryBatch = (() => {
    if (!multipleWeights) return null;
    try {
      return parseWeightEntries(weightsText);
    } catch {
      return null;
    }
  })();
  function updateWeights(text: string) {
    setWeightsText(text);
    try {
      const batch = parseWeightEntries(text);
      setWeight(batch.quantity);
      setBoxes(tier === "box" ? String(batch.boxes) : "0");
    } catch {
      setWeight("");
      setBoxes("0");
    }
  }
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = contentRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || preference.matches) return;
    const animation = node.animate(
      [
        { opacity: 0.75, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    const cancel = () => animation.cancel();
    preference.addEventListener("change", cancel);
    window.addEventListener("beforeprint", cancel);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", cancel);
      window.removeEventListener("beforeprint", cancel);
    };
  }, [page, loading, login]);
  const pendingCheckout = useRef<R | null>(null);
  const [pendingOperation, setPendingOperation] = useState<R | null>(null);
  const checkoutKey = useRef(""),
    formKey = useRef(""),
    formFingerprint = useRef("");
  async function refresh() {
    const res = await fetch(`/api/shop?from=${from}&to=${to}`, {
      cache: "no-store",
    });
    if (res.status === 401) {
      setLogin(true);
      setState(null);
      return;
    }
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error);
    setState(data);
    setLogin(false);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    try {
      const saved = JSON.parse(localStorage.getItem("carved-cart") || "null");
      if (saved) {
        setCart(restoreCart(saved.cart));
        setCustomer(saved.customer || "");
        setLocation(saved.location || "freezer");
        setTendered(saved.tendered || "");
        setDraftId(saved.draftId);
        setFulfillment(
          saved.fulfillment === "delivery" ? "delivery" : "walkin",
        );
        setDelivery(saved.delivery || emptyDelivery);
        checkoutKey.current = saved.key || "";
      }
    } catch {}
    try {
      pendingCheckout.current = JSON.parse(
        localStorage.getItem("carved-pending-checkout") || "null",
      );
      if (pendingCheckout.current?.cart) {
        setCart(restoreCart(pendingCheckout.current.cart));
        setFulfillment(pendingCheckout.current.data?.fulfillment || "walkin");
        setDelivery(pendingCheckout.current.data?.delivery || emptyDelivery);
      }
    } catch {}
    setCartReady(true);
    try {
      setPendingOperation(
        JSON.parse(localStorage.getItem("carved-pending-operation") || "null"),
      );
    } catch {}
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (cartReady)
      localStorage.setItem(
        "carved-cart",
        JSON.stringify({
          cart,
          customer,
          location,
          tendered,
          draftId,
          fulfillment,
          delivery,
          key: checkoutKey.current,
        }),
      );
  }, [
    cart,
    customer,
    location,
    tendered,
    draftId,
    cartReady,
    fulfillment,
    delivery,
  ]);
  useEffect(() => {
    if (state) refresh().catch((e) => setError(e.message));
  }, [from, to]);
  async function mutate(action: string, data: R, key?: string) {
    if (busy) throw new Error("Please wait for the current operation");
    if (!online)
      throw new Error("Connection required. Your cart remains on this tablet.");
    const existing = JSON.parse(
      localStorage.getItem("carved-pending-operation") || "null",
    );
    const request = existing || {
      action,
      data,
      key: key || crypto.randomUUID(),
    };
    if (existing && existing.key !== key)
      throw new Error(
        "Confirm the pending record before saving another operation.",
      );
    localStorage.setItem("carved-pending-operation", JSON.stringify(request));
    setPendingOperation(request);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const result = await res.json();
      if (!res.ok) {
        const failure = new Error(result.error || "Unable to save") as Error & {
          definite: boolean;
        };
        failure.definite = res.status < 500;
        if (failure.definite) {
          localStorage.removeItem("carved-pending-operation");
          setPendingOperation(null);
        }
        throw failure;
      }
      localStorage.removeItem("carved-pending-operation");
      setPendingOperation(null);
      await refresh().catch(() =>
        setNotice(
          "Record saved. Refresh to update the screen; do not enter it again.",
        ),
      );
      return result;
    } finally {
      setBusy(false);
    }
  }
  function open(kind: string, data: R = {}) {
    setError("");
    setModal({ kind, ...data });
    setForm(
      data.initial ||
        (kind === "purchase"
          ? { lines: [{ productId: "", quantity: "", cost: "", boxes: "0" }] }
          : {}),
    );
    setAttachment(null);
    formKey.current = crypto.randomUUID();
    formFingerprint.current = "";
  }
  const set = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function confirmDeletion() {
    if (!deletion || busy) return;
    try {
      if (cart.some((line) => line.productId === deletion.id) && !cartChange())
        return;
      await mutate("delete", {
        entity: "product",
        id: deletion.id,
        reason: "Product deleted after confirmation",
      });
      setCart((lines) =>
        lines.filter((line) => line.productId !== deletion.id),
      );
      if (selected?.id === deletion.id) setSelected(null);
      setDeletion(null);
      setNotice("Product deleted.");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  function cartChange() {
    if (pendingCheckout.current) {
      setError(
        "A checkout is awaiting confirmation. Retry the original checkout before editing this order.",
      );
      return false;
    }
    checkoutKey.current = "";
    return true;
  }
  function addLine() {
    if (!selected) return;
    const price = selected.data.prices[tier];
    if (price == null) {
      setError("This price tier is unavailable");
      return;
    }
    if (multipleWeights && !entryBatch) {
      try {
        parseWeightEntries(weightsText);
      } catch (reason) {
        setError((reason as Error).message);
      }
      return;
    }
    const normalizedWeight = normalizeQuantity(weight);
    if (
      !/^\d+(\.\d{1,3})?$/.test(normalizedWeight) ||
      Number(normalizedWeight) <= 0
    ) {
      setError("Enter a positive quantity with up to three decimals");
      return;
    }
    if (!cartChange()) return;
    try {
      validateCartLine({
        quantity: qty(weightGrams(normalizedWeight)),
        price,
        tier,
        boxes,
        unit: selected.unit,
        weightEntries: entryBatch?.entries,
      });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setCart([
      ...cart,
      {
        productId: selected.id,
        name: selected.name,
        unit: selected.unit,
        quantity: qty(weightGrams(normalizedWeight)),
        weightEntries: entryBatch?.entries,
        tier,
        price,
        boxes: tier === "box" ? boxCount(boxes) : 0,
        overrideReason: override,
      },
    ]);
    setSelected(null);
    setMultipleWeights(false);
    setWeightsText("");
    setWeight("1.000");
    setBoxes("0");
    setOverride("");
  }
  const total = cart.reduce(
    (s, l) => s + lineAmount(l.quantity, (l.price / 100).toFixed(2)),
    0,
  );
  async function checkout(action = "sale") {
    if (busy) return;
    if (!pendingCheckout.current) {
      try {
        parseFulfillment(fulfillment, delivery);
        cart.forEach(validateCartLine);
      } catch (error) {
        setError((error as Error).message);
        return;
      }
      if (!checkoutKey.current) checkoutKey.current = crypto.randomUUID();
      pendingCheckout.current = {
        cart,
        action,
        key: checkoutKey.current,
        data: {
          ...parseFulfillment(fulfillment, delivery),
          locationId: location,
          partyId: customer || undefined,
          lines: cart.map(
            ({
              productId,
              quantity,
              tier,
              boxes,
              overrideReason,
              price,
              weightEntries,
            }) => ({
              productId,
              quantity,
              tier,
              boxes: tier === "box" ? boxCount(boxes) : 0,
              overrideReason,
              expectedPrice: price,
              weightEntries,
            }),
          ),
          tendered:
            fulfillment === "delivery" && delivery.paymentMethod === "cod"
              ? "0"
              : tendered || "0",
          draftId,
        },
      };
      localStorage.setItem(
        "carved-pending-checkout",
        JSON.stringify(pendingCheckout.current),
      );
    }
    const request = pendingCheckout.current;
    try {
      const result = await mutate(request.action, request.data, request.key);
      pendingCheckout.current = null;
      localStorage.removeItem("carved-pending-checkout");
      setCart([]);
      setTendered("");
      setCustomer("");
      setDraftId(undefined);
      setFulfillment("walkin");
      setDelivery(emptyDelivery);
      checkoutKey.current = "";
      localStorage.removeItem("carved-cart");
      if (request.action === "sale")
        setReceipt({
          id: result.id,
          number: result.number,
          created_at: result.created_at,
          party_id: request.data.partyId,
          data: result,
          balance: result.total - result.paid,
          freshSale: true,
        });
      setNotice(
        request.action === "sale"
          ? "Sale saved. You can print or reprint at any time."
          : "Draft saved. Stock and accounting will post at checkout.",
      );
    } catch (e) {
      if ((e as Error & { definite?: boolean }).definite) {
        pendingCheckout.current = null;
        localStorage.removeItem("carved-pending-checkout");
      }
      setError(checkoutError(e as Error & { definite?: boolean }));
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;
    let action = modal.kind,
      data = { ...form };
    if (action === "product") {
      data = { ...data, id: modal.product?.id };
    }
    if (action === "purchase")
      data = {
        partyId: form.partyId,
        reference: form.reference,
        lines: form.lines.map((l: R) => ({
          ...l,
          boxes: Number(l.boxes || 0),
        })),
      };
    if (action === "receive")
      data = {
        orderId: modal.document.id,
        locationId: form.locationId || "storage",
        lines: [
          {
            index: Number(form.index || 0),
            quantity: form.quantity,
            boxes: Number(form.boxes || 0),
          },
        ],
      };
    if (action === "payment" || action === "supplierPayment")
      data = {
        documentId: modal.document.id,
        amount: form.amount,
        tendered: form.tendered || form.amount,
      };
    if (action === "return")
      data = {
        saleId: modal.document.id,
        index: Number(form.index || 0),
        quantity: form.quantity,
        reason: form.reason,
        restock: form.restock === true,
      };
    if (action === "adjust") data = { ...data, kind: form.kind || "count" };
    if (action === "settings")
      data = {
        ...data,
        margin: Number(form.margin),
        density: Number(form.density),
      };
    const fp = JSON.stringify({ action, data });
    if (fp !== formFingerprint.current) {
      formKey.current = crypto.randomUUID();
      formFingerprint.current = fp;
    }
    try {
      const saved = await mutate(action, data, formKey.current);
      setModal(null);
      if (action === "expense" && attachment) {
        try {
          const upload = new FormData();
          upload.set("file", attachment);
          upload.set("documentId", saved.id);
          const r = await fetch("/api/attachments", {
            method: "POST",
            body: upload,
          });
          if (!r.ok) {
            const d = await r.json();
            setModal(null);
            setError("Expense saved. Attachment failed: " + d.error);
            return;
          }
          await refresh();
        } catch (e) {
          setError(
            "Expense saved. Attachment upload or refresh failed; do not record the expense again. " +
              (e as Error).message,
          );
          return;
        }
      }
      setModal(null);
      setNotice("Saved successfully.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.message || "Sign in failed");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <LoadingScreen />;
  if (login || !state)
    return (
      <main className="login">
        <section className="login-card">
          <img src="/carved-logo-transparent.png" alt="CARVED Meat Shop" />
          <div className="eyebrow">YOUR DAILY OPERATIONS, TOGETHER</div>
          <h1>Welcome to the shop.</h1>
          <p>Sign in to manage sales, stock, and accounts.</p>
          <Toast message={error} tone="error" onDismiss={() => setError("")} />
          <form onSubmit={signIn}>
            <Field label="Owner email">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoadingIndicator label="Signing in…" inline />
              ) : (
                <>
                  Sign in <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <small>
            First use? Create your owner account using the secure setup command
            in the README.
          </small>
        </section>
      </main>
    );
  const s = state,
    products = s.products as R[],
    docs = s.documents as R[],
    customers = s.parties.filter((p: R) => p.kind === "customer"),
    suppliers = s.parties.filter((p: R) => p.kind === "supplier");
  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name || id;
  const partyName = (id: string) =>
    s.parties.find((p: R) => p.id === id)?.name || "Walk-in customer";
  const locName = (id: string) =>
    s.locations.find((l: R) => l.id === id)?.name || id;
  const stockQty = (pid: string, lid?: string) =>
    s.stock
      .filter((x: R) => x.product_id === pid && (!lid || x.location_id === lid))
      .reduce((n: number, x: R) => n + x.quantity, 0);
  const low = products.filter(
    (p) => p.unit === "kg" && stockQty(p.id) <= p.data.lowStock,
  );
  const filtered = products.filter(
    (p) =>
      p.data.active &&
      (category === "All products" || p.category === category) &&
      `${p.name} ${p.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  const input = (
    label: string,
    key: string,
    type = "text",
    required = true,
    placeholder?: string,
  ) => (
    <Field label={label}>
      <input
        value={form[key] ?? ""}
        type={type}
        required={required}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );
  const select = (
    label: string,
    key: string,
    options: R[],
    valueKey = "id",
    nameKey = "name",
    fallback = "",
  ) => (
    <Field label={label}>
      <select
        value={form[key] ?? fallback}
        required
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o[valueKey]} value={o[valueKey]}>
            {o[nameKey]}
          </option>
        ))}
      </select>
    </Field>
  );
  const locationSelect = (key = "locationId", fallback = "") =>
    select("Stock location", key, s.locations, "id", "name", fallback);
  const productSelect = () =>
    select(
      "Product",
      "productId",
      products.filter((p) => p.unit === "kg"),
    );
  function loadDraft(d: R) {
    if (!cartChange()) return;
    setCart(
      d.data.lines.map((l: R) => ({
        ...l,
        quantity: qty(l.quantity),
        weightEntries: l.weightEntries?.map((n: number) => qty(n)),
      })),
    );
    setCustomer(d.party_id || "");
    setFulfillment(d.data.fulfillment || "walkin");
    setDelivery(d.data.delivery || emptyDelivery);
    setLocation(d.data.locationId);
    setDraftId(d.id);
    setPage("Sales / POS");
  }
  function exportLedger() {
    download("carved-general-ledger.csv", [
      [
        "Journal",
        "Date (UTC)",
        "Document",
        "Memo",
        "Account",
        "Debit PHP",
        "Credit PHP",
      ],
      ...s.journals.flatMap((j: R) =>
        j.data.map((e: R) => [
          j.id,
          new Date(j.created_at).toISOString(),
          j.document_id,
          j.memo,
          e.account,
          ((e.debit || 0) / 100).toFixed(2),
          ((e.credit || 0) / 100).toFixed(2),
        ]),
      ),
    ]);
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/carved-logo-transparent.png" alt="CARVED Meat Shop" />
        </div>
        <div className="eyebrow nav-label">SHOP WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              aria-label={label}
              title={label}
              className={page === label ? "active" : ""}
              onClick={() => {
                setPage(label);
                setSearch("");
                setError("");
                setNotice("");
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Inventory" && low.length > 0 && <b>{low.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">CO</div>
          <div>
            <strong>Shop owner</strong>
            <small>Owner workspace</small>
          </div>
          <button
            aria-label="Sign out"
            onClick={async () => {
              await fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              setLogin(true);
              setState(null);
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            CARVED <ChevronRight size={14} /> <strong>{page}</strong>
          </span>
          <div>
            <PrinterStatus onOpenSettings={() => setPage("Settings")} />
            {!online && (
              <span className="connection offline">
                <i /> Internet offline
              </span>
            )}
            <span className="date">
              {new Intl.DateTimeFormat("en-PH", {
                timeZone: "Asia/Manila",
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date())}
            </span>
            <div className="avatar small">CO</div>
          </div>
        </header>
        <main ref={contentRef} className="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CARVED MEAT SHOP</div>
              <h1>
                {page === "Overview"
                  ? "A clear view of your shop."
                  : page === "Sales / POS"
                    ? "Let’s make a sale."
                    : page}
              </h1>
              <p>
                {
                  (
                    {
                      Overview: "Your sales, stock, and balances in one place.",
                      "Sales / POS":
                        "Select a product, enter the weight, and check out.",
                      Inventory: "Know what’s in storage and ready to sell.",
                      Purchases:
                        "Order, receive, and settle supplier balances.",
                      Invoices:
                        "Customer sales, drafts, payments, and returns.",
                      Receipts:
                        "Every saved sale, ready to preview or reprint.",
                      Expenses: "Keep everyday shop costs accounted for.",
                      Accounting:
                        "Connected bookkeeping, from each transaction to your reports.",
                      Products: "Your product catalog and selling prices.",
                      "Customers & suppliers":
                        "The people you buy from and sell to.",
                      "Audit history":
                        "A traceable record of changes in your shop.",
                      Settings:
                        "Business details, documents, and print preferences.",
                    } as R
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "Accounting" && (
                <button
                  onClick={() =>
                    open("funds", { initial: { account: "Cash" } })
                  }
                >
                  <Plus size={17} /> Record owner funds
                </button>
              )}
              {page === "Overview" && (
                <button
                  className="primary"
                  onClick={() => setPage("Sales / POS")}
                >
                  <Plus size={18} /> New sale
                </button>
              )}
              {page === "Inventory" && (
                <>
                  <button
                    onClick={() =>
                      open("adjust", {
                        initial: { kind: "count", locationId: "storage" },
                      })
                    }
                  >
                    <Scale size={17} /> Record count
                  </button>
                  <button className="primary" onClick={() => open("transfer")}>
                    <ArrowLeftRight size={17} /> Transfer stock
                  </button>
                </>
              )}
              {page === "Products" && (
                <button
                  className="primary"
                  onClick={() =>
                    open("product", {
                      initial: { unit: "kg", category: "Pork", active: true },
                    })
                  }
                >
                  <Plus size={18} /> Add product
                </button>
              )}
              {page === "Purchases" && (
                <button className="primary" onClick={() => open("purchase")}>
                  <Plus size={18} /> New purchase
                </button>
              )}
              {page === "Expenses" && (
                <button
                  className="primary"
                  onClick={() =>
                    open("expense", { initial: { date: today() } })
                  }
                >
                  <Plus size={18} /> Record expense
                </button>
              )}
              {page === "Customers & suppliers" && (
                <button
                  className="primary"
                  onClick={() =>
                    open("party", { initial: { kind: "customer" } })
                  }
                >
                  <Plus size={18} /> Add contact
                </button>
              )}
            </div>
          </div>
          {!modal && (
            <Toast
              message={error}
              tone="error"
              onDismiss={() => setError("")}
            />
          )}
          <Toast
            message={notice}
            tone="success"
            onDismiss={() => setNotice("")}
          />
          {pendingOperation && !busy && (
            <Toast
              persistent
              message="A record is awaiting confirmation. Confirm the original record before starting another operation."
              action={
                <>
                  <button
                    onClick={async () => {
                      if (
                        pendingOperation.action === "sale" ||
                        pendingOperation.action === "draft"
                      ) {
                        await checkout(pendingOperation.action);
                        return;
                      }
                      try {
                        await mutate(
                          pendingOperation.action,
                          pendingOperation.data,
                          pendingOperation.key,
                        );
                        setModal(null);
                        setNotice(
                          "Original record confirmed. It was posted once.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Confirm pending record
                  </button>
                </>
              }
            />
          )}
          {(page === "Overview" || page === "Accounting") && (
            <div className="range">
              <span>Report period · Manila time</span>
              <input
                aria-label="Report start date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span>to</span>
              <input
                aria-label="Report end date"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
              <select
                aria-label="Report preset"
                defaultValue="today"
                onChange={(e) => {
                  setFrom(periodStart(e.target.value));
                  setTo(today());
                }}
              >
                <option value="today">Today</option>
                <option value="week">Last 7 days</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
              </select>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="metrics">
                {[
                  [
                    "Net sales",
                    s.report.revenue,
                    "Revenue after returns",
                    ShoppingBasket,
                  ],
                  [
                    "Gross profit",
                    s.report.grossProfit,
                    "Net sales less cost of goods",
                    ChartNoAxesCombined,
                  ],
                  [
                    "Operating costs",
                    s.report.expenses,
                    "Expenses, spoilage & variance",
                    Wallet,
                  ],
                  [
                    "Net profit",
                    s.report.netProfit,
                    "Gross profit less operating costs",
                    Receipt,
                  ],
                ].map(([label, value, sub, Icon]: any) => (
                  <section className="metric" key={label}>
                    <div>
                      <span>{label}</span>
                      <Icon size={19} />
                    </div>
                    <strong>{php(value)}</strong>
                    <small>{sub}</small>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent sales</h2>
                      <p>Saved transactions across your shop</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("Invoices")}
                    >
                      View all <ArrowRight size={16} />
                    </button>
                  </div>
                  {docs.filter((d) => d.kind === "sale").length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Customer</th>
                            <th>Total</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs
                            .filter((d) => d.kind === "sale")
                            .slice(0, 6)
                            .map((d) => (
                              <tr key={d.id}>
                                <td>
                                  <button
                                    className="link"
                                    onClick={() => setReceipt(d)}
                                  >
                                    {number(d, s.settings)}
                                  </button>
                                  <small>{date(d.created_at)}</small>
                                </td>
                                <td>
                                  {d.data.fulfillment === "delivery" &&
                                  !d.party_id
                                    ? d.data.delivery?.recipient ||
                                      "Walk-in customer"
                                    : partyName(d.party_id)}
                                  {d.data.fulfillment === "delivery" && (
                                    <small>Delivery</small>
                                  )}
                                </td>
                                <td className="numeric">{php(d.data.total)}</td>
                                <td>
                                  <Pill tone={d.balance ? "amber" : "green"}>
                                    {d.balance ? "Balance due" : "Paid"}
                                  </Pill>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty>Your first sale will appear here.</Empty>
                  )}
                </section>
                <section className="panel stock-alert">
                  <div className="panel-heading">
                    <div>
                      <h2>Stock to watch</h2>
                      <p>{low.length} products at or below threshold</p>
                    </div>
                    <Package size={21} />
                  </div>
                  {low.length ? (
                    low.slice(0, 5).map((p) => (
                      <div className="stock-row" key={p.id}>
                        <div className="product-mark">
                          {p.category.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.code} · {p.category}
                          </small>
                        </div>
                        <b>
                          {qty(stockQty(p.id))}
                          <small>kg on hand</small>
                        </b>
                      </div>
                    ))
                  ) : (
                    <Empty>
                      All stocked products are above their thresholds.
                    </Empty>
                  )}
                  <button className="wide" onClick={() => setPage("Inventory")}>
                    Open inventory <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="balance-strip">
                <div>
                  <Users size={21} />
                  <span>
                    Customer balances
                    <strong>{php(s.report.receivables)}</strong>
                  </span>
                </div>
                <div>
                  <Truck size={21} />
                  <span>
                    Supplier balances<strong>{php(s.report.payables)}</strong>
                  </span>
                </div>
                <div>
                  <Package size={21} />
                  <span>
                    Inventory at cost<strong>{php(s.report.inventory)}</strong>
                  </span>
                </div>
                <div>
                  <Check size={21} />
                  <span>
                    Journal reconciliation
                    <strong>
                      {s.report.balanced ? "Balanced" : "Needs review"}
                    </strong>
                  </span>
                </div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Latest stock movements</h2>
                    <p>Every receipt, transfer, sale, and adjustment</p>
                  </div>
                </div>
                <MovementTable
                  items={s.movements.slice(0, 5)}
                  productName={productName}
                  locName={locName}
                />
              </section>
            </>
          )}
          {page === "Sales / POS" && (
            <div className="pos-grid">
              <section>
                <div className="search">
                  <Search size={19} />
                  <input
                    aria-label="Search products"
                    placeholder="Search by product name or code…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>SEARCH</kbd>
                </div>
                <div className="categories">
                  {[
                    "All products",
                    ...new Set(products.map((p) => p.category)),
                  ].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="products-grid">
                  {filtered.map((p) => (
                    <div key={p.id} className="product-tile">
                      <button
                        className={`product-card ${selected?.id === p.id ? "chosen" : ""}`}
                        onClick={() => {
                          setSelected(p);
                          setMultipleWeights(false);
                          setWeightsText("");
                          setTier("retail");
                          setWeight("1.000");
                          setBoxes("0");
                        }}
                      >
                        <div
                          className={`product-symbol ${p.category.toLowerCase().replaceAll(" ", "-")}`}
                        >
                          <span>
                            {p.category === "Services" ? (
                              <Scale size={27} />
                            ) : (
                              p.category.slice(0, 1)
                            )}
                          </span>
                          <Plus size={17} />
                        </div>
                        <small>
                          {p.code} · {p.category}
                        </small>
                        <strong>{p.name}</strong>
                        <div>
                          <b>
                            {p.data.prices.retail == null
                              ? "Unavailable"
                              : php(p.data.prices.retail)}
                          </b>
                          <span>
                            / {p.unit === "kg" ? "kg" : p.data.serviceUnit}
                          </span>
                        </div>
                        <small
                          className={
                            stockQty(p.id) === 0 && p.unit === "kg"
                              ? "zero"
                              : ""
                          }
                        >
                          {p.unit === "kg"
                            ? `${qty(stockQty(p.id, location))} kg at ${locName(location)}`
                            : "Service · no stock deduction"}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="danger product-delete"
                        disabled={busy}
                        aria-label={`Delete product ${p.name}`}
                        onClick={() => {
                          setError("");
                          setDeletion(p);
                        }}
                      >
                        <Trash2 size={16} /> Delete product
                      </button>
                    </div>
                  ))}
                </div>
                {!filtered.length && (
                  <Empty>
                    No matching products. Add products in the catalog first.
                  </Empty>
                )}
                {selected && (
                  <section className="weight-panel panel">
                    <div className="panel-heading">
                      <h2>{selected.name}</h2>
                      <button
                        aria-label="Close product entry"
                        onClick={() => setSelected(null)}
                      >
                        <X size={17} />
                      </button>
                    </div>
                    {selected.unit === "kg" && (
                      <label className="checkbox weight-entry-toggle">
                        <input
                          type="checkbox"
                          checked={multipleWeights}
                          onChange={(e) => {
                            setMultipleWeights(e.target.checked);
                            setWeightsText("");
                            setWeight(e.target.checked ? "" : "1.000");
                            setBoxes("0");
                          }}
                        />{" "}
                        Enter multiple box weights
                      </label>
                    )}
                    {multipleWeights && selected.unit === "kg" && (
                      <div className="weight-entry-batch">
                        <Field label="Weights per box / entry (kg)">
                          <textarea
                            rows={5}
                            value={weightsText}
                            placeholder={"11.67\n11.46\n11.39"}
                            onChange={(e) => updateWeights(e.target.value)}
                          />
                        </Field>
                        <p aria-live="polite">
                          {entryBatch
                            ? `${entryBatch.boxes} weights - total ${entryBatch.quantity} kg`
                            : "For 6 boxes, enter 6 separate weights (one per line). You can also paste weights separated by commas or spaces. Box count is automatic."}
                        </p>
                      </div>
                    )}
                    <div className="form-grid">
                      <Field
                        label={
                          selected.unit === "kg"
                            ? "Weight (kg)"
                            : "Service quantity"
                        }
                      >
                        <input
                          aria-label="Quantity"
                          readOnly={multipleWeights}
                          inputMode="decimal"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                        />
                      </Field>
                      <Field label="Selling price tier">
                        <select
                          aria-label="Selling price tier"
                          value={tier}
                          onChange={(e) => {
                            setTier(e.target.value);
                            setBoxes(
                              multipleWeights &&
                                entryBatch &&
                                e.target.value === "box"
                                ? String(entryBatch.boxes)
                                : "0",
                            );
                          }}
                        >
                          {[
                            ["retail", "RETAIL"],
                            ["bulk", "5 KG UP"],
                            ["box", "BOX"],
                          ].map(([v, l]) => (
                            <option
                              key={v}
                              value={v}
                              disabled={selected.data.prices[v] == null}
                            >
                              {l} ·{" "}
                              {selected.data.prices[v] == null
                                ? "Unavailable"
                                : php(selected.data.prices[v])}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {tier === "box" && (
                        <Field label="Box count (actual kg entered separately)">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={boxes}
                            readOnly={multipleWeights}
                            onChange={(e) => setBoxes(e.target.value)}
                          />
                        </Field>
                      )}
                      {tier === "bulk" && Number(weight) < 5 && (
                        <Field label="Owner threshold override reason">
                          <input
                            value={override}
                            onChange={(e) => setOverride(e.target.value)}
                          />
                        </Field>
                      )}
                    </div>
                    {!multipleWeights && (
                      <div className="keypad">
                        {[
                          "1",
                          "2",
                          "3",
                          "4",
                          "5",
                          "6",
                          "7",
                          "8",
                          "9",
                          ".",
                          "0",
                          "⌫",
                        ].map((k) => (
                          <button
                            key={k}
                            onClick={() =>
                              setWeight((v) =>
                                k === "⌫"
                                  ? v.slice(0, -1)
                                  : v === "1.000"
                                    ? k
                                    : v + k,
                              )
                            }
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    )}
                    <button className="primary wide" onClick={addLine}>
                      <Plus size={18} /> Add to order
                    </button>
                  </section>
                )}
              </section>
              <aside
                className="cart panel"
                aria-label="Current order"
                tabIndex={0}
              >
                <div className="panel-heading">
                  <div>
                    <h2>Current order</h2>
                    <p>
                      {draftId
                        ? "Saved invoice draft"
                        : fulfillment === "delivery"
                          ? "Delivery sale"
                          : "Walk-in sale"}{" "}
                      · {cart.length} items
                    </p>
                  </div>
                  <ShoppingBasket size={21} />
                </div>
                <div className="cart-fields">
                  <Field label="Sell from">
                    <select
                      value={location}
                      onChange={(e) => {
                        if (!cartChange()) return;
                        setLocation(e.target.value);
                      }}
                    >
                      {s.locations.map((l: R) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Order type">
                    <select
                      aria-label="Order type"
                      value={fulfillment}
                      disabled={busy}
                      onChange={(e) => {
                        if (!cartChange()) return;
                        setFulfillment(e.target.value);
                      }}
                    >
                      <option value="walkin">Walk-in</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </Field>
                  {fulfillment === "delivery" && (
                    <div className="delivery-fields">
                      <Field label="Delivery recipient">
                        <input
                          aria-label="Delivery recipient"
                          value={delivery.recipient || ""}
                          type="text"
                          maxLength={200}
                          disabled={busy}
                          onChange={(e) => {
                            if (!cartChange()) return;
                            setDelivery((current) => ({
                              ...current,
                              recipient: e.target.value,
                            }));
                          }}
                        />
                      </Field>
                      <Field label="Delivery contact number (optional)">
                        <input
                          aria-label="Delivery contact number (optional)"
                          value={delivery.contact || ""}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={60}
                          disabled={busy}
                          onChange={(e) => {
                            if (!cartChange()) return;
                            setDelivery((current) => ({
                              ...current,
                              contact: e.target.value,
                            }));
                          }}
                        />
                      </Field>
                      <Field label="Delivery address">
                        <textarea
                          aria-label="Delivery address"
                          value={delivery.address || ""}
                          maxLength={500}
                          disabled={busy}
                          onChange={(e) => {
                            if (!cartChange()) return;
                            setDelivery((current) => ({
                              ...current,
                              address: e.target.value,
                            }));
                          }}
                        />
                      </Field>
                      <Field label="Delivery notes (optional)">
                        <textarea
                          aria-label="Delivery notes (optional)"
                          value={delivery.notes || ""}
                          maxLength={500}
                          disabled={busy}
                          onChange={(e) => {
                            if (!cartChange()) return;
                            setDelivery((current) => ({
                              ...current,
                              notes: e.target.value,
                            }));
                          }}
                        />
                      </Field>
                      <small>
                        Delivery details appear on the receipt. No delivery
                        charge is added.
                      </small>
                      <Field label="Payment method">
                        <select
                          aria-label="Payment method"
                          value={delivery.paymentMethod || "cash_now"}
                          disabled={busy}
                          onChange={(e) => {
                            if (!cartChange()) return;
                            if (e.target.value === "cod") setTendered("");
                            setDelivery((current) => ({
                              ...current,
                              paymentMethod: e.target.value,
                            }));
                          }}
                        >
                          <option value="cash_now">Cash paid now</option>
                          <option value="cod">Cash on delivery (COD)</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  <Field label="Customer">
                    <select
                      value={customer}
                      onChange={(e) => {
                        if (!cartChange()) return;
                        setCustomer(e.target.value);
                      }}
                    >
                      <option value="">
                        {fulfillment === "delivery"
                          ? delivery.paymentMethod === "cod"
                            ? "Guest customer · payable on delivery"
                            : "Guest customer · full payment required"
                          : "Walk-in · full payment required"}
                      </option>
                      {customers.map((c: R) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="cart-lines">
                  {cart.length ? (
                    cart.map((l, i) => (
                      <div className="cart-line" key={i}>
                        <div>
                          <strong>{l.name}</strong>
                          <small>
                            {l.quantity} {l.unit === "kg" ? "kg" : "units"} ×{" "}
                            {php(l.price)} · {l.tier.toUpperCase()}
                          </small>
                          {l.weightEntries?.length > 0 && (
                            <small>
                              {l.weightEntries.length} weights:{" "}
                              {l.weightEntries.slice(0, 3).join(" + ")}
                              {l.weightEntries.length > 3 ? " ..." : ""} kg
                            </small>
                          )}
                        </div>
                        <b>
                          {php(
                            lineAmount(l.quantity, (l.price / 100).toFixed(2)),
                          )}
                        </b>
                        <button
                          aria-label={`Remove ${l.name}`}
                          onClick={() => {
                            if (!cartChange()) return;
                            setCart(cart.filter((_, n) => n !== i));
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty>Add a product to start this order.</Empty>
                  )}
                </div>
                <div className="cart-bottom">
                  <div className="total">
                    <span>Order total</span>
                    <strong>{php(total)}</strong>
                  </div>
                  {(fulfillment === "walkin" ||
                    delivery.paymentMethod !== "cod") && (
                    <Field
                      label={
                        fulfillment === "delivery"
                          ? "Cash received now (PHP)"
                          : "Cash tendered (PHP)"
                      }
                    >
                      <input
                        inputMode="decimal"
                        value={tendered}
                        placeholder="0.00"
                        onChange={(e) => {
                          if (!cartChange()) return;
                          setTendered(e.target.value);
                        }}
                      />
                    </Field>
                  )}
                  <div className="payment-summary">
                    <span>
                      {fulfillment === "delivery" &&
                      delivery.paymentMethod === "cod"
                        ? "Due on delivery"
                        : Number(tendered) * 100 >= total
                          ? "Change"
                          : "Balance due"}
                    </span>
                    <b>
                      {fulfillment === "delivery" &&
                      delivery.paymentMethod === "cod"
                        ? php(total)
                        : php(
                            Math.abs(
                              Math.round(Number(tendered || 0) * 100) - total,
                            ),
                          )}
                    </b>
                  </div>
                  <button
                    className="primary wide"
                    disabled={busy || !cart.length || !online}
                    onClick={() => checkout()}
                  >
                    <Check size={18} />
                    {busy ? (
                      <LoadingIndicator label="Saving..." inline />
                    ) : (
                      "Complete sale"
                    )}
                  </button>
                  <button
                    className="wide"
                    disabled={busy || !cart.length || !online}
                    onClick={() => checkout("draft")}
                  >
                    Save invoice draft
                  </button>
                  <small className="cart-note">
                    Cart is kept on this device. Checkout needs a server
                    connection.
                  </small>
                </div>
              </aside>
            </div>
          )}
          {page === "Inventory" && (
            <>
              <div className="metrics compact">
                <section className="metric">
                  <span>Stock at cost</span>
                  <strong>{php(s.report.inventory)}</strong>
                </section>
                <section className="metric">
                  <span>Total stock weight</span>
                  <strong>
                    {qty(
                      s.stock.reduce((a: number, b: R) => a + b.quantity, 0),
                    )}{" "}
                    <small>kg</small>
                  </strong>
                </section>
                <section className="metric">
                  <span>Low stock products</span>
                  <strong>{low.length}</strong>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Stock by location</h2>
                  <button onClick={() => open("location")}>
                    <Plus size={16} /> Add location
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        {s.locations.map((l: R) => (
                          <th key={l.id}>{l.name} · kg</th>
                        ))}
                        <th>Total kg</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter((p) => p.unit === "kg")
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small>
                                {p.code} · {p.category}
                              </small>
                            </td>
                            {s.locations.map((l: R) => (
                              <td className="numeric" key={l.id}>
                                {qty(stockQty(p.id, l.id))}
                              </td>
                            ))}
                            <td className="numeric">
                              <strong>{qty(stockQty(p.id))}</strong>
                            </td>
                            <td>
                              <Pill
                                tone={
                                  stockStatus(stockQty(p.id), p.data.lowStock)
                                    .tone
                                }
                              >
                                {
                                  stockStatus(stockQty(p.id), p.data.lowStock)
                                    .label
                                }
                              </Pill>
                              <small>
                                Alert at ≤ {qty(p.data.lowStock)} kg total
                              </small>
                            </td>
                            <td>
                              <button
                                className="primary"
                                onClick={() =>
                                  open("restock", {
                                    product: p,
                                    initial: {
                                      productId: p.id,
                                      partyId:
                                        suppliers.length === 1
                                          ? suppliers[0].id
                                          : "",
                                      locationId: "freezer",
                                    },
                                  })
                                }
                              >
                                <Plus size={16} /> Restock
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Movement ledger</h2>
                  <button
                    onClick={() =>
                      download("stock-ledger.csv", [
                        [
                          "Date UTC",
                          "Product",
                          "Location",
                          "Movement",
                          "Quantity kg",
                          "Value PHP",
                          "Reason",
                          "Actor",
                        ],
                        ...s.movements.map((m: R) => [
                          new Date(m.created_at).toISOString(),
                          productName(m.product_id),
                          locName(m.location_id),
                          m.kind,
                          qty(Number(m.quantity)),
                          (Number(m.value) / 100).toFixed(2),
                          m.reason,
                          m.actor,
                        ]),
                      ])
                    }
                  >
                    Export CSV
                  </button>
                </div>
                <MovementTable
                  items={s.movements}
                  productName={productName}
                  locName={locName}
                />
              </section>
            </>
          )}
          {page === "Products" && (
            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th>BOX</th>
                      <th>5 KG UP</th>
                      <th>RETAIL</th>
                      <th>Availability</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>
                            {p.code} · {p.category}
                          </small>
                        </td>
                        <td>{p.unit === "kg" ? "kg" : p.data.serviceUnit}</td>
                        {["box", "bulk", "retail"].map((t) => (
                          <td key={t} className="numeric">
                            {p.data.prices[t] == null
                              ? "Unavailable"
                              : php(p.data.prices[t])}
                          </td>
                        ))}
                        <td>
                          <Pill tone={p.data.active ? "green" : "amber"}>
                            {p.data.active ? "Active" : "Inactive"}
                          </Pill>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              onClick={() =>
                                open("product", {
                                  product: p,
                                  initial: {
                                    ...p,
                                    lowStock: qty(p.data.lowStock),
                                    active: p.data.active,
                                    serviceUnit: p.data.serviceUnit,
                                    brand: p.data.brand,
                                    cut: p.data.cut,
                                    ...Object.fromEntries(
                                      ["retail", "bulk", "box"].map((t) => [
                                        t,
                                        p.data.prices[t] == null
                                          ? ""
                                          : (p.data.prices[t] / 100).toFixed(2),
                                      ]),
                                    ),
                                  },
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={busy}
                              aria-label={`Delete ${p.name}`}
                              onClick={() => {
                                setError("");
                                setDeletion(p);
                              }}
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!products.length && (
                <Empty>Add your first product and configure its prices.</Empty>
              )}
            </section>
          )}
          {page === "Purchases" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Purchase orders & supplier balances</h2>
                <Pill>Stock increases on receiving only</Pill>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Purchase</th>
                      <th>Supplier</th>
                      <th>Ordered items</th>
                      <th>Received value</th>
                      <th>Payable</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs
                      .filter((d) => d.kind === "purchase")
                      .map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{number(d, s.settings)}</strong>
                            <small>
                              {d.data.reference || "No supplier reference"}
                            </small>
                          </td>
                          <td>
                            {d.data.fulfillment === "delivery" && !d.party_id
                              ? d.data.delivery?.recipient || "Walk-in customer"
                              : partyName(d.party_id)}
                            {d.data.fulfillment === "delivery" && (
                              <small>Delivery</small>
                            )}
                          </td>
                          <td>
                            {d.data.lines.map((l: R, i: number) => (
                              <small key={i}>
                                {l.name} · {qty(l.quantity)} kg × {php(l.cost)}
                              </small>
                            ))}
                          </td>
                          <td className="numeric">{php(d.received)}</td>
                          <td className="numeric">{php(d.balance)}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                onClick={() =>
                                  open("receive", {
                                    document: d,
                                    initial: {
                                      index: "0",
                                      locationId: "storage",
                                    },
                                  })
                                }
                              >
                                Receive stock
                              </button>
                              <button
                                disabled={!d.balance}
                                onClick={() =>
                                  open("supplierPayment", {
                                    document: d,
                                    initial: {
                                      amount: (d.balance / 100).toFixed(2),
                                    },
                                  })
                                }
                              >
                                Pay supplier
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!docs.some((d) => d.kind === "purchase") && (
                <Empty>
                  Create a purchase order, then receive actual stock.
                </Empty>
              )}
            </section>
          )}
          {(page === "Invoices" || page === "Receipts") && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  {page === "Invoices"
                    ? "Customer invoices & drafts"
                    : "Saved sales"}
                </h2>
                <Pill>Accountant review required for statutory use</Pill>
              </div>
              {page === "Invoices" && <ReviewExport state={s} />}
              {page === "Invoices" && (
                <InvoiceReconciliation state={s} mutate={mutate} />
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs
                      .filter(
                        (d) =>
                          d.kind === "sale" ||
                          (page === "Invoices" && d.kind === "draft"),
                      )
                      .map((d) => {
                        const posted =
                          d.kind === "draft" &&
                          docs.some(
                            (x) => x.kind === "sale" && x.data.draftId === d.id,
                          );
                        return (
                          <tr key={d.id}>
                            <td>
                              <strong>{number(d, s.settings)}</strong>
                              <small>{date(d.created_at)}</small>
                            </td>
                            <td>
                              {d.data.fulfillment === "delivery" && !d.party_id
                                ? d.data.delivery?.recipient ||
                                  "Walk-in customer"
                                : partyName(d.party_id)}
                              {d.data.fulfillment === "delivery" && (
                                <small>Delivery</small>
                              )}
                            </td>
                            <td className="numeric">{php(d.data.total)}</td>
                            <td className="numeric">
                              {d.kind === "sale" ? php(d.balance) : "—"}
                            </td>
                            <td>
                              <Pill
                                tone={
                                  d.kind === "draft"
                                    ? "blue"
                                    : d.balance
                                      ? "amber"
                                      : "green"
                                }
                              >
                                {d.kind === "draft"
                                  ? posted
                                    ? "Draft posted"
                                    : "Draft"
                                  : d.balance
                                    ? "Part paid / unpaid"
                                    : "Paid"}
                              </Pill>
                            </td>
                            <td>
                              <div className="row-actions">
                                {d.kind === "draft" ? (
                                  <button
                                    disabled={posted}
                                    onClick={() => loadDraft(d)}
                                  >
                                    Open in POS
                                  </button>
                                ) : (
                                  <>
                                    <button onClick={() => setReceipt(d)}>
                                      <Receipt size={15} /> Preview
                                    </button>
                                    {page === "Invoices" && (
                                      <>
                                        <button
                                          disabled={!d.balance}
                                          onClick={() =>
                                            open("payment", {
                                              document: d,
                                              initial: {
                                                amount: (
                                                  d.balance / 100
                                                ).toFixed(2),
                                              },
                                            })
                                          }
                                        >
                                          Payment
                                        </button>
                                        <button
                                          onClick={() =>
                                            open("return", {
                                              document: d,
                                              initial: {
                                                index: "0",
                                                restock: true,
                                              },
                                            })
                                          }
                                        >
                                          Return / reverse
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!docs.some((d) => d.kind === "sale" || d.kind === "draft") && (
                <Empty>Saved sales and invoices will appear here.</Empty>
              )}
            </section>
          )}
          {page === "Expenses" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Recorded shop expenses</h2>
                <span>Payment account is recorded per expense</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Payee</th>
                      <th>Notes</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs
                      .filter((d) => d.kind === "expense")
                      .map((d) => (
                        <tr key={d.id}>
                          <td>{d.data.date}</td>
                          <td>
                            <strong>{d.data.category}</strong>
                          </td>
                          <td>
                            {d.data.payee}
                            <small>{d.data.paymentAccount || "Cash"}</small>
                          </td>
                          <td>
                            {d.data.notes || "—"}
                            {(s.attachments || [])
                              .filter((a: R) => a.document_id === d.id)
                              .map((a: R) => (
                                <small key={a.id}>
                                  <a href={"/api/attachments/" + a.id}>
                                    {a.name}
                                  </a>
                                </small>
                              ))}
                          </td>
                          <td className="numeric">{php(d.data.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!docs.some((d) => d.kind === "expense") && (
                <Empty>
                  Record rent, utilities, supplies, and other operating costs.
                </Empty>
              )}
            </section>
          )}
          {page === "Customers & suppliers" && (
            <section className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Contact</th>
                      <th>Address</th>
                      <th>Outstanding</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {s.parties.map((p: R) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>
                          <Pill>{p.kind}</Pill>
                        </td>
                        <td>{p.data.contact || "—"}</td>
                        <td>{p.data.address || "—"}</td>
                        <td className="numeric">
                          {php(
                            docs
                              .filter(
                                (d) =>
                                  d.party_id === p.id &&
                                  (d.kind === "sale" || d.kind === "purchase"),
                              )
                              .reduce((a, d) => a + (d.balance || 0), 0),
                          )}
                        </td>
                        <td>
                          <button onClick={() => open("history", { party: p })}>
                            View history
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!s.parties.length && (
                <Empty>
                  Add customers for credit sales and suppliers for purchases.
                </Empty>
              )}
            </section>
          )}
          {page === "Accounting" && (
            <>
              <div className="info">
                <FileText size={20} />
                <div>
                  <strong>
                    Operational bookkeeping · proposed full-accounting scope
                  </strong>
                  <p>
                    Accrual basis, perpetual weighted-average inventory. Reports
                    need client and accountant review. Tax and statutory
                    certification are not included.
                  </p>
                </div>
              </div>
              <div className="report-toolbar">
                <div className="categories">
                  {[
                    "Profit & loss",
                    "Trial balance",
                    "Balance sheet",
                    "General ledger",
                    "Receivables",
                    "Payables",
                    "Cash movement",
                  ].map((t) => (
                    <button
                      className={reportTab === t ? "selected" : ""}
                      onClick={() => setReportTab(t)}
                      key={t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={exportLedger}>Export general ledger</button>
              </div>
              <section className="panel report">
                <div className="panel-heading">
                  <div>
                    <h2>{reportTab}</h2>
                    <p>
                      {[
                        "Balance sheet",
                        "Trial balance",
                        "Receivables",
                        "Payables",
                      ].includes(reportTab)
                        ? "Current cumulative balances; period selector applies to P&L, ledger and cash movement."
                        : `${from} through ${to} · Asia/Manila`}
                    </p>
                  </div>
                  <Pill tone={s.report.balanced ? "green" : "amber"}>
                    {s.report.balanced
                      ? "Journals balanced"
                      : "Imbalance detected"}
                  </Pill>
                </div>
                {reportTab === "Profit & loss" && (
                  <div className="report-lines">
                    {[
                      ["Sales revenue after returns", s.report.revenue],
                      ["Cost of goods sold", s.report.cogs],
                      ["Gross profit", s.report.grossProfit],
                      [
                        "Operating expenses, spoilage & variance",
                        s.report.expenses,
                      ],
                      ["Net profit", s.report.netProfit],
                    ].map(([l, v], i) => (
                      <div
                        className={i === 2 || i === 4 ? "subtotal" : ""}
                        key={l}
                      >
                        <span>{l}</span>
                        <strong>{php(Number(v))}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {reportTab === "Trial balance" && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Debit</th>
                          <th>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(s.accounts).map(([a, v]: any) => (
                          <tr key={a}>
                            <td>{a}</td>
                            <td className="numeric">{php(Math.max(0, v))}</td>
                            <td className="numeric">{php(Math.max(0, -v))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>Total</th>
                          <th>
                            {php(
                              Object.values(s.accounts).reduce(
                                (a: number, v: any) => a + Math.max(0, v),
                                0,
                              ),
                            )}
                          </th>
                          <th>
                            {php(
                              Object.values(s.accounts).reduce(
                                (a: number, v: any) => a + Math.max(0, -v),
                                0,
                              ),
                            )}
                          </th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {reportTab === "Balance sheet" && (
                  <div className="report-lines">
                    {[
                      ["Cash", s.report.cash],
                      ["Bank", s.accounts.Bank || 0],
                      ["Accounts receivable", s.report.receivables],
                      ["Inventory", s.report.inventory],
                      [
                        "Total assets",
                        s.report.cash +
                          (s.accounts.Bank || 0) +
                          s.report.receivables +
                          s.report.inventory,
                      ],
                      ["Accounts payable", s.report.payables],
                      ["Opening equity", -(s.accounts["Opening equity"] || 0)],
                      ["Owner capital", -(s.accounts["Owner capital"] || 0)],
                      [
                        "Accumulated earnings",
                        -(s.accounts["Sales revenue"] || 0) -
                          (s.accounts["Cost of goods sold"] || 0) -
                          (s.accounts["Operating expenses"] || 0) -
                          (s.accounts.Spoilage || 0) -
                          (s.accounts["Inventory variance"] || 0),
                      ],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <span>{l}</span>
                        <strong>{php(Number(v))}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {reportTab === "General ledger" && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date / journal</th>
                          <th>Account</th>
                          <th>Debit</th>
                          <th>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.journals.flatMap((j: R) =>
                          j.data.map((e: R, i: number) => (
                            <tr key={j.id + i}>
                              <td>
                                {date(j.created_at)}
                                <small>
                                  {j.memo} · {j.document_id.slice(0, 8)}
                                </small>
                              </td>
                              <td>{e.account}</td>
                              <td className="numeric">{php(e.debit || 0)}</td>
                              <td className="numeric">{php(e.credit || 0)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {(reportTab === "Receivables" || reportTab === "Payables") && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Party</th>
                          <th>Document</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs
                          .filter(
                            (d) =>
                              d.kind ===
                                (reportTab === "Receivables"
                                  ? "sale"
                                  : "purchase") && d.balance > 0,
                          )
                          .map((d) => (
                            <tr key={d.id}>
                              <td>
                                {d.data.fulfillment === "delivery" &&
                                !d.party_id
                                  ? d.data.delivery?.recipient ||
                                    "Walk-in customer"
                                  : partyName(d.party_id)}
                                {d.data.fulfillment === "delivery" && (
                                  <small>Delivery</small>
                                )}
                              </td>
                              <td>{number(d, s.settings)}</td>
                              <td className="numeric">{php(d.balance)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {reportTab === "Cash movement" && (
                  <div className="report-lines">
                    <div className="subtotal">
                      <span>Net cash movement in period</span>
                      <strong>{php(s.report.cashMovement)}</strong>
                    </div>
                    {s.journals.flatMap((j: R) =>
                      j.data
                        .filter((e: R) => e.account === "Cash")
                        .map((e: R, i: number) => (
                          <div key={j.id + i}>
                            <span>
                              {date(j.created_at)} · {j.memo}
                            </span>
                            <strong>
                              {php((e.debit || 0) - (e.credit || 0))}
                            </strong>
                          </div>
                        )),
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {page === "Audit history" && <AuditHistory shop={s} />}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Business & document layout</h2>

                  <button
                    onClick={() => open("settings", { initial: s.settings })}
                  >
                    Edit settings
                  </button>
                </div>
                <dl>
                  {[
                    ["Business", s.settings.name],
                    ["Address", s.settings.address || "Not configured"],
                    ["Contact", s.settings.contact || "Not configured"],
                    ["Invoice heading", s.settings.heading],
                    ["Document prefix", s.settings.prefix],
                    ["Footer", s.settings.footer],
                    [
                      "Receipt",
                      `80 mm · ${s.settings.margin} mm margins · ${s.settings.density}px density`,
                    ],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <dt>{l}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="info">
                  Invoice layout requires accountant review before statutory
                  use. Customization does not establish BIR compliance.
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Printer & data</h2>
                  <Printer size={20} />
                </div>
                <div className="settings-body">
                  <PrinterConnectionSettings />
                  <button
                    onClick={() => {
                      const d = docs.find((d) => d.kind === "sale");
                      if (d) setReceipt(d);
                      else
                        setError(
                          "Save a sale first to preview a real receipt.",
                        );
                    }}
                  >
                    Preview saved receipt
                  </button>
                  <hr />
                  <h3>Backup & restore</h3>
                  <p>
                    Stop the server, run <code>npm run backup</code>, and copy
                    the archive to secure storage. Restore into a new directory
                    using the documented procedure.
                  </p>
                  <button
                    onClick={() =>
                      download("carved-complete-records.csv", [
                        ["Kind", "ID", "Number", "Date UTC", "Party", "Data"],
                        ...docs.map((d) => [
                          d.kind,
                          d.id,
                          d.number,
                          new Date(d.created_at).toISOString(),
                          d.party_id,
                          JSON.stringify(d.data),
                        ]),
                      ])
                    }
                  >
                    Export all transaction records
                  </button>
                  <p className="muted">
                    CSV exports supplement the full database backup; they do not
                    replace it.
                  </p>
                  <h3>Owner account</h3>
                  <p>
                    Registration is closed. Password change requires your
                    current password.
                  </p>
                  <button onClick={() => open("password")}>
                    Change password
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
        <footer className="app-footer">
          CARVED Meat Shop{" "}
          <span>Online-first operations · PHP · Asia/Manila</span>
        </footer>
      </div>
      {modal && (
        <Modal
          ariaLabel={modal.kind}
          busy={busy}
          onClose={() => setModal(null)}
        >
          <div className="panel-heading">
            <h2>
              {
                (
                  {
                    product: modal.product ? "Edit product" : "New product",
                    party: "Customer / supplier",
                    purchase: "New purchase order",
                    receive: "Receive purchased stock",
                    restock: "Restock product",
                    transfer: "Transfer stock",
                    adjust: "Count, spoilage & adjustment",
                    expense: "Record expense",
                    payment: "Customer payment",
                    supplierPayment: "Supplier payment",
                    return: "Linked return / reversal",
                    settings: "Document settings",
                    location: "Add stock location",
                    history: "Transaction history",
                    password: "Change owner password",
                    documentLayouts: "Customer & accountant invoice templates",
                    funds: "Record owner funds",
                  } as R
                )[modal.kind]
              }
            </h2>
            <button
              aria-label="Close dialog"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
          </div>
          <Toast message={error} tone="error" onDismiss={() => setError("")} />
          {modal.kind === "history" ? (
            <div className="settings-body">
              <h3>{modal.party.name}</h3>
              {docs
                .filter((d) => d.party_id === modal.party.id)
                .map((d) => (
                  <div className="history-row" key={d.id}>
                    <strong>
                      {d.kind} · {number(d, s.settings)}
                    </strong>
                    <span>
                      {date(d.created_at)} ·{" "}
                      {php(d.data.total || d.data.amount || 0)}
                    </span>
                  </div>
                ))}
            </div>
          ) : modal.kind === "password" ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const r = await fetch("/api/auth/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      currentPassword: form.currentPassword,
                      newPassword: form.newPassword,
                      revokeOtherSessions: true,
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok)
                    throw new Error(d.message || "Password change failed");
                  setModal(null);
                  setNotice("Password changed. Other sessions revoked.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {input("Current password", "currentPassword", "password")}
              {input(
                "New password (12 characters minimum)",
                "newPassword",
                "password",
              )}
              <button disabled={busy} className="primary wide">
                Change password
              </button>
            </form>
          ) : (
            <form onSubmit={submit}>
              {modal.kind === "product" && (
                <>
                  {input(
                    "Product code (optional)",
                    "code",
                    "text",
                    false,
                    modal.product
                      ? "Leave blank to keep the current code"
                      : "Leave blank to generate automatically",
                  )}
                  {input("Product name", "name")}
                  {input("Category", "category")}
                  {input("Brand (optional)", "brand", "text", false)}
                  {input("Cut (optional)", "cut", "text", false)}
                  {select("Unit", "unit", [
                    { id: "kg", name: "Kilogram" },
                    { id: "service", name: "Service units" },
                  ])}
                  {form.unit === "service" &&
                    input(
                      "Service charge unit (confirm with shop)",
                      "serviceUnit",
                    )}
                  {["retail", "bulk", "box"].map((t) => (
                    <div key={t}>
                      {input(
                        `${t === "bulk" ? "5 KG UP" : t.toUpperCase()} · PHP per ${form.unit === "service" ? "unit" : "kg"} (blank = unavailable)`,
                        t,
                        "text",
                        false,
                      )}
                    </div>
                  ))}
                  {input("Low stock threshold (kg)", "lowStock", "text", false)}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.active !== false}
                      onChange={(e) => set("active", e.target.checked)}
                    />{" "}
                    Active for sale
                  </label>
                </>
              )}
              {modal.kind === "party" && (
                <>
                  {input("Name", "name")}
                  {select("Type", "kind", [
                    { id: "customer", name: "Customer" },
                    { id: "supplier", name: "Supplier" },
                  ])}
                  {input("Contact", "contact", "text", false)}
                  {input("Address", "address", "text", false)}
                </>
              )}
              {modal.kind === "location" && input("Location name", "name")}
              {modal.kind === "purchase" && (
                <>
                  {select("Supplier", "partyId", suppliers)}
                  {input("Supplier reference", "reference", "text", false)}
                  {(form.lines || []).map((line: R, index: number) => {
                    const update = (key: string, value: string) =>
                      set(
                        "lines",
                        form.lines.map((l: R, i: number) =>
                          i === index ? { ...l, [key]: value } : l,
                        ),
                      );
                    return (
                      <section className="purchase-line" key={index}>
                        <h3>Purchase line {index + 1}</h3>
                        <Field label="Product">
                          <select
                            required
                            value={line.productId}
                            onChange={(e) =>
                              update("productId", e.target.value)
                            }
                          >
                            <option value="">Select product</option>
                            {products
                              .filter((p) => p.unit === "kg")
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Ordered actual weight (kg)">
                          <input
                            required
                            value={line.quantity}
                            onChange={(e) => update("quantity", e.target.value)}
                          />
                        </Field>
                        <Field label="Supplier cost (PHP/kg)">
                          <input
                            required
                            value={line.cost}
                            onChange={(e) => update("cost", e.target.value)}
                          />
                        </Field>
                        <Field label="Box count (optional)">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.boxes}
                            onChange={(e) => update("boxes", e.target.value)}
                          />
                        </Field>
                        {form.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "lines",
                                form.lines.filter(
                                  (_: R, i: number) => i !== index,
                                ),
                              )
                            }
                          >
                            Remove line
                          </button>
                        )}
                      </section>
                    );
                  })}
                  <button
                    type="button"
                    className="wide"
                    onClick={() =>
                      set("lines", [
                        ...form.lines,
                        { productId: "", quantity: "", cost: "", boxes: "0" },
                      ])
                    }
                  >
                    <Plus size={17} /> Add purchase line
                  </button>
                  <p className="muted">
                    Orders do not increase stock. Receive actual weights after
                    delivery. Each line can be received in partial deliveries.
                  </p>
                </>
              )}
              {modal.kind === "restock" && (
                <>
                  <h3 style={{ marginBottom: 16 }}>{modal.product.name}</h3>
                  {select("Supplier", "partyId", suppliers)}
                  {locationSelect("locationId", "freezer")}
                  {input("Add stock (kg)", "quantity")}
                  {input("Supplier cost (PHP/kg)", "cost")}
                  <p className="muted">
                    Adds the entered kg to existing stock. The supplier balance
                    is recorded under Purchases; supplier payment can be
                    recorded there.
                  </p>
                </>
              )}
              {modal.kind === "receive" && (
                <>
                  {select(
                    "Purchase line",
                    "index",
                    modal.document.data.lines.map((l: R, i: number) => ({
                      id: String(i),
                      name: `${l.name} · ordered ${qty(l.quantity)} kg`,
                    })),
                    "id",
                    "name",
                    "0",
                  )}
                  {locationSelect("locationId", "storage")}
                  {input("Actual weight received now (kg)", "quantity")}
                  {input("Boxes received now", "boxes", "number", false)}
                  <p className="muted">
                    Partial receipts are tracked. The server prevents receiving
                    more than ordered.
                  </p>
                </>
              )}
              {modal.kind === "transfer" && (
                <>
                  {productSelect()}
                  {select("From location", "from", s.locations)}
                  {select("To location", "to", s.locations)}
                  {input("Weight to transfer (kg)", "quantity")}
                  {input("Reason", "reason")}
                </>
              )}
              {modal.kind === "adjust" && (
                <>
                  {productSelect()}
                  {locationSelect("locationId", "storage")}
                  {select(
                    "Adjustment kind",
                    "kind",
                    [
                      {
                        id: "opening",
                        name: "Opening inventory (before any movements)",
                      },
                      { id: "count", name: "Physical count (set actual kg)" },
                      { id: "spoilage", name: "Spoilage (remove kg)" },
                      {
                        id: "adjustment",
                        name: "Positive stock adjustment (add kg)",
                      },
                    ],
                    "id",
                    "name",
                    "count",
                  )}
                  {input(
                    form.kind === "count" || form.kind === "opening"
                      ? "Actual counted stock (kg)"
                      : "Quantity (kg)",
                    "quantity",
                  )}
                  {form.kind !== "spoilage" &&
                    input(
                      "Cost of additional stock (PHP/kg, if increasing)",
                      "cost",
                      "text",
                      false,
                    )}
                  {input("Reason / count reference", "reason")}
                </>
              )}
              {modal.kind === "expense" && (
                <>
                  {input("Expense date", "date", "date")}
                  {input("Category", "category")}
                  {input("Payee", "payee")}
                  {input("Amount (PHP)", "amount")}
                  {select(
                    "Paid from",
                    "paymentAccount",
                    [
                      { id: "Cash", name: "Cash" },
                      { id: "Bank", name: "Bank" },
                    ],
                    "id",
                    "name",
                    "Cash",
                  )}
                  {input("Notes", "notes", "text", false)}
                  <Field label="Optional receipt attachment · PDF / PNG / JPEG, up to 5 MB">
                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={(e) =>
                        setAttachment(e.target.files?.[0] || null)
                      }
                    />
                  </Field>
                </>
              )}
              {modal.kind === "funds" && (
                <>
                  {select(
                    "Receiving account",
                    "account",
                    [
                      { id: "Cash", name: "Cash" },
                      { id: "Bank", name: "Bank" },
                    ],
                    "id",
                    "name",
                    "Cash",
                  )}
                  {input("Amount (PHP)", "amount")}
                  {input("Reason / opening cash reference", "reason")}
                  <p className="muted">
                    Owner funding increases cash or bank and owner capital. It
                    is not sales revenue.
                  </p>
                </>
              )}
              {(modal.kind === "payment" ||
                modal.kind === "supplierPayment") && (
                <>
                  <div className="info">
                    Outstanding balance: {php(modal.document.balance)}
                  </div>
                  {input("Payment amount (PHP)", "amount")}
                  {modal.kind === "payment" &&
                    input("Cash tendered (PHP)", "tendered", "text", false)}
                </>
              )}
              {modal.kind === "return" && (
                <>
                  {select(
                    "Original sale line",
                    "index",
                    modal.document.data.lines.map((l: R, i: number) => ({
                      id: String(i),
                      name: `${l.name} · ${qty(l.quantity)} ${l.unit === "kg" ? "kg" : "units"}`,
                    })),
                    "id",
                    "name",
                    "0",
                  )}
                  {input("Quantity to return", "quantity")}
                  {input("Reason for return / reversal", "reason")}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.restock === true}
                      onChange={(e) => set("restock", e.target.checked)}
                    />{" "}
                    Return physical meat to original location
                  </label>
                  <p className="muted">
                    Unpaid balances are reduced first. Any remainder is a cash
                    refund. To reverse a whole sale, return each line in full.
                    Posted history stays visible.
                  </p>
                </>
              )}
              {modal.kind === "settings" && (
                <>
                  {input("Business name", "name")}
                  {input("Address", "address", "text", false)}
                  {input("Contact", "contact", "text", false)}
                  {input("Invoice heading", "heading")}
                  {input(
                    "Additional invoice fields / registration details (accountant reviewed)",
                    "invoiceDetails",
                    "text",
                    false,
                  )}
                  {input("Document prefix", "prefix")}
                  {input("Footer", "footer", "text", false)}
                  {input("Print margin (0–10 mm)", "margin", "number")}
                  {input("Print density (9–16 px)", "density", "number")}
                  {select("Printer adapter", "printer", [
                    { id: "browser", name: "Browser print fallback" },
                    {
                      id: "unconfigured",
                      name: "Direct adapter · not configured",
                    },
                  ])}
                  <p className="muted">
                    Invoice fields and tax registration wording require
                    accountant review. This application does not certify
                    statutory invoices.
                  </p>
                </>
              )}
              <button
                type="submit"
                className="primary wide"
                disabled={busy || !online}
              >
                {busy ? (
                  <LoadingIndicator label="Saving..." inline />
                ) : (
                  "Save " + (modal.kind === "return" ? "return" : "record")
                )}
              </button>
            </form>
          )}
        </Modal>
      )}
      {deletion && (
        <Modal
          ariaLabel="Confirm deletion"
          busy={busy}
          onClose={() => setDeletion(null)}
        >
          <div className="panel-heading">
            <h2>Delete {deletion.name}?</h2>
            <button
              disabled={busy}
              aria-label="Close delete confirmation"
              onClick={() => setDeletion(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="settings-body">
            <p>
              Delete this product from the catalog and remove any unsaved order
              lines for it? Products with stock or saved transaction history are
              protected. This deletion stays in audit history.
            </p>
            <div className="row-actions">
              <button disabled={busy} onClick={() => setDeletion(null)}>
                Cancel
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={confirmDeletion}
              >
                {busy ? (
                  <LoadingIndicator label="Deleting..." inline />
                ) : (
                  <>
                    <Trash2 size={16} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {receipt && (
        <ReceiptDialog
          key={receipt.id}
          freshSale={Boolean(receipt.freshSale)}
          document={receipt}
          settings={s.settings}
          related={docs}
          customer={partyName(receipt.party_id)}
          onClose={() => setReceipt(null)}
        />
      )}
      {busy && <LoadingOverlay />}
    </div>
  );
}
