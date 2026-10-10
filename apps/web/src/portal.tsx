"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Package,
  ShoppingBag,
  Truck,
  IndianRupee,
  Download,
  Upload,
  Search,
  Plus,
  Pencil,
  ChevronRight,
  FlaskConical,
  Leaf,
  Clock,
  CircleAlert,
  Check,
  ExternalLink,
  Printer,
  Settings as SettingsIcon,
  Activity,
} from "lucide-react";
import type { Product, Order, Ticket } from "../../../packages/core/src/domain";
import {
  api,
  useApp,
  Button,
  PageTitle,
  Badge,
  Status,
  Empty,
  Field,
  Notice,
  Modal,
  money,
  date,
  human,
  useFilter,
} from "./ui";
import {
  RulesForm,
  BusinessForm,
  InventoryUpload,
  InventoryReview,
  Simulator,
  type ImportPreview,
} from "./forms";
import { BuildPanel } from "./build-panel";

export function PortalPage({
  section,
  detailId,
}: {
  section: string;
  detailId?: string;
}) {
  switch (section) {
    case "products":
      return <Products />;
    case "orders":
      return detailId ? (
        <OrderDetail id={decodeURIComponent(detailId)} />
      ) : (
        <Orders />
      );
    case "deliveries":
      return <Deliveries />;
    case "rules":
      return (
        <>
          <PageTitle
            eyebrow="MAKE IT YOURS"
            title="Your business. Your rules."
            description="Set the defaults that keep your day-to-day running smoothly."
          />
          <section className="card">
            <RulesForm />
          </section>
        </>
      );
    case "payments":
      return <Payments />;
    case "support":
      return <Support />;
    case "settings":
      return <Settings />;
    default:
      return <Overview />;
  }
}
function ModeBanner() {
  const { snapshot } = useApp();
  return (
    <div className="mode-banner">
      <span className="row" style={{ gap: 7 }}>
        <FlaskConical size={13} />
        {snapshot.state.demo
          ? "Demo workspace · sample inventory and simulated orders"
          : "Local test mode · orders, payments and deliveries are simulated"}
      </span>
      <Link href="/settings">
        Connection details
        <ArrowUpRight
          size={11}
          style={{ verticalAlign: "middle", marginLeft: 4 }}
        />
      </Link>
    </div>
  );
}
function ProductName({
  product,
}: {
  product: Pick<Product, "name" | "sku" | "category">;
}) {
  return (
    <div className="product-name">
      <span
        className={`product-tile ${product.category.toLowerCase().includes("tea") ? "tea" : product.category.includes("oil") ? "oil" : ""}`}
      >
        <Leaf size={19} strokeWidth={1.25} />
      </span>
      <div>
        <strong>{product.name}</strong>
        <small>{product.sku}</small>
      </div>
    </div>
  );
}
function OrderTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th>
              <span className="hidden-label">View order</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              className="clickable"
              onClick={() => router.push(`/orders/${o.id}`)}
            >
              <td>
                <Link className="text-link" href={`/orders/${o.id}`}>
                  {o.id}
                </Link>
                {o.simulated && (
                  <small
                    style={{ display: "block", fontSize: 9, marginTop: 4 }}
                  >
                    Test order
                  </small>
                )}
              </td>
              <td>
                {o.customer}
                <small style={{ display: "block", fontSize: 10, marginTop: 4 }}>
                  {o.pincode}
                </small>
              </td>
              <td className="subtle">{date(o.createdAt)}</td>
              <td>{money(o.quote.total)}</td>
              <td>
                <Status value={o.status} />
              </td>
              <td>
                <ChevronRight size={14} color="#9ca790" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Overview() {
  const { snapshot } = useApp();
  const { state: s } = snapshot;
  const [simulator, setSimulator] = useState(false);
  const router = useRouter();
  const active = s.orders.filter(
    (o) => !["cancelled", "returned"].includes(o.status),
  );
  const low = s.products.filter(
    (p) =>
      p.enabled &&
      p.stock - p.reserved - s.rules.safetyStock < s.rules.lowStock,
  );
  const dispatch = s.orders.filter((o) =>
    ["confirmed", "packed", "ready"].includes(o.status),
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - 6 + i);
    const key = day.toLocaleDateString("en-IN");
    return {
      label: day.toLocaleDateString("en-IN", { weekday: "short" }),
      value: active
        .filter(
          (o) => new Date(o.createdAt).toLocaleDateString("en-IN") === key,
        )
        .reduce((sum, o) => sum + o.quote.total, 0),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <>
      <ModeBanner />
      <PageTitle
        eyebrow="YOUR BUSINESS AT A GLANCE"
        title={`Good to see you, ${s.business?.owner.split(" ")[0] ?? "there"}.`}
        description="Here’s what’s happening with your store today."
        action={
          <Button
            secondary
            onClick={() => setSimulator(true)}
            disabled={!s.products.length}
          >
            <Plus size={15} />
            Test an order
          </Button>
        }
      />
      <div className="metrics">
        {[
          [
            "Order value",
            money(active.reduce((sum, o) => sum + o.quote.total, 0)),
            "Simulated value · no money collected",
            IndianRupee,
          ],
          [
            "Total orders",
            String(s.orders.length),
            `${dispatch.length} waiting to be dispatched`,
            ShoppingBag,
          ],
          [
            "Active products",
            String(s.products.filter((p) => p.enabled).length),
            `${s.products.length} products in your catalogue`,
            Package,
          ],
          [
            "Ready for pickup",
            String(s.orders.filter((o) => o.status === "ready").length),
            "Keep your parcels moving",
            Truck,
          ],
        ].map(([label, value, note, Icon]) => {
          const MetricIcon = Icon as typeof Package;
          return (
            <div className="card metric" key={String(label)}>
              <div className="metric-label">
                <span>{String(label)}</span>
                <MetricIcon size={16} strokeWidth={1.5} />
              </div>
              <div className="metric-value">{String(value)}</div>
              <small>{String(note)}</small>
            </div>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Orders over the week</h2>
              <p>A little perspective on your progress.</p>
            </div>
            <Badge>Last 7 days</Badge>
          </div>
          <div className="row spread">
            <strong
              style={{ fontFamily: "Manrope", fontSize: 24, fontWeight: 600 }}
            >
              {money(days.reduce((sum, d) => sum + d.value, 0))}
            </strong>
            <span className="chart-legend">
              <i />
              Simulated order value
            </span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={`Simulated order value over the last seven days: ${days.map((d) => `${d.label} ${money(d.value)}`).join(", ")}`}
          >
            {days.map((d, i) => (
              <div className="chart-bar-wrap" key={i}>
                <div
                  className="chart-bar"
                  title={`${d.label}: ${money(d.value)}`}
                  style={{
                    height: `${d.value ? Math.max(4, (d.value / max) * 100) : 1}%`,
                  }}
                />
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card" id="attention">
          <div className="card-heading">
            <h2>A little attention needed</h2>
            <Badge tone="amber">
              {low.length + (dispatch.length ? 1 : 0) + 1} items
            </Badge>
          </div>
          <div className="activity-list">
            {dispatch.length > 0 && (
              <Link href="/orders" className="activity-item">
                <div className="activity-icon">
                  <ShoppingBag size={15} />
                </div>
                <div>
                  <strong>{dispatch.length} orders to prepare</strong>
                  <p>Pack them and arrange a pickup.</p>
                </div>
                <ChevronRight
                  size={14}
                  style={{ marginLeft: "auto", marginTop: 5 }}
                />
              </Link>
            )}
            {low.slice(0, 2).map((p) => (
              <Link key={p.sku} href="/products" className="activity-item">
                <div
                  className="activity-icon"
                  style={{ color: "#b28d55", background: "#f8f1e6" }}
                >
                  <Package size={15} />
                </div>
                <div>
                  <strong>{p.name} is running low</strong>
                  <p>
                    {Math.max(0, p.stock - p.reserved - s.rules.safetyStock)}{" "}
                    available · update your stock
                  </p>
                </div>
              </Link>
            ))}
            <Link href="/settings" className="activity-item">
              <div className="activity-icon">
                <Activity size={15} />
              </div>
              <div>
                <strong>Your ONDC connection</strong>
                <p>Complete onboarding to start live trading.</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
      <section className="card table-card">
        <div className="card-heading">
          <div>
            <h2>Recent orders</h2>
            <p>The latest from your customers.</p>
          </div>
          <Link className="text-link" href="/orders">
            View all orders{" "}
            <ArrowUpRight size={13} style={{ verticalAlign: "middle" }} />
          </Link>
        </div>
        {s.orders.length ? (
          <OrderTable orders={s.orders.slice(0, 5)} />
        ) : (
          <Empty
            title="Your first order starts here"
            description="Try the buyer simulator to see an order move through your workspace."
            action={
              <Button
                secondary
                disabled={!s.products.length}
                onClick={() => setSimulator(true)}
              >
                Try a test order
              </Button>
            }
          />
        )}
      </section>
      <div className="quick-start">
        <div className="row">
          <div
            className="empty-orbit"
            style={{ width: 39, height: 39, borderRadius: 10 }}
          >
            <Leaf size={21} />
          </div>
          <div>
            <h3>Growing starts with a good catalogue.</h3>
            <p>Keep your products, prices and availability up to date.</p>
          </div>
        </div>
        <Link className="button secondary small" href="/products">
          Manage inventory
          <ArrowRight size={13} />
        </Link>
      </div>
      {simulator && (
        <Modal title="Try a buyer order" onClose={() => setSimulator(false)}>
          <Simulator
            allowOrder
            onCreated={(o) => router.push(`/orders/${o.id}`)}
          />
        </Modal>
      )}
    </>
  );
}
function Products() {
  const { snapshot, act, busy } = useApp();
  const { state: s } = snapshot;
  const filter = useFilter();
  const [status, setStatus] = useState("all");
  const [upload, setUpload] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const products = s.products.filter(
    (p) =>
      filter.matches(p.name, p.sku, p.category) &&
      (status === "all" ||
        (status === "low" &&
          p.stock - p.reserved - s.rules.safetyStock < s.rules.lowStock) ||
        (status === "paused" && !p.enabled)),
  );
  return (
    <>
      <PageTitle
        eyebrow="YOUR CATALOGUE"
        title="Products & stock"
        description="Everything you sell, with availability you can trust."
        action={
          <>
            <a className="button secondary" href="/api/inventory/export">
              <Download size={14} />
              Export Excel
            </a>
            <Button
              onClick={() => {
                setPreview(null);
                setUpload(true);
              }}
            >
              <Upload size={14} />
              Upload inventory
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Search products"
            placeholder="Search products or product codes…"
            value={filter.search}
            onChange={(e) => filter.setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter products"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All products</option>
          <option value="low">Low stock</option>
          <option value="paused">Paused products</option>
        </select>
      </div>
      <section className="card table-card">
        {products.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Physical</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.sku}>
                      <td>
                        <ProductName product={p} />
                      </td>
                      <td className="subtle">{p.category}</td>
                      <td>{money(p.price)}</td>
                      <td>{p.stock}</td>
                      <td className="subtle">{p.reserved}</td>
                      <td
                        style={{
                          color:
                            p.stock - p.reserved - s.rules.safetyStock <
                            s.rules.lowStock
                              ? "#af8b47"
                              : undefined,
                        }}
                      >
                        {Math.max(
                          0,
                          p.stock - p.reserved - s.rules.safetyStock,
                        )}
                      </td>
                      <td>
                        <Badge tone={p.enabled ? "green" : "neutral"}>
                          {p.enabled ? "Active" : "Paused"}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEdit({ ...p })}
                        >
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              {products.length} products · Available = physical stock − reserved
              stock − stock kept aside
            </div>
          </>
        ) : (
          <Empty
            title="No products to show"
            description="Upload your spreadsheet or change your search to find a product."
            action={
              <Button secondary onClick={() => setUpload(true)}>
                Upload inventory
              </Button>
            }
          />
        )}
      </section>
      {upload && (
        <Modal
          title={preview ? "Review your inventory" : "Update your catalogue"}
          onClose={() => setUpload(false)}
        >
          {preview ? (
            <InventoryReview
              preview={preview}
              setPreview={setPreview}
              onImported={() => setUpload(false)}
            />
          ) : (
            <InventoryUpload onPreview={setPreview} />
          )}
        </Modal>
      )}
      {edit && (
        <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () =>
                    api(
                      `/products/${encodeURIComponent(edit.sku)}`,
                      { product: edit, version: s.inventoryVersion },
                      "PUT",
                    ),
                  "Product updated",
                )
              )
                setEdit(null);
            }}
          >
            <div className="fields">
              <Field label="Product name">
                <input
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </Field>
              <Field label="Product code">
                <input disabled value={edit.sku} />
              </Field>
              {(["price", "mrp", "stock", "weight", "taxRate"] as const).map(
                (key) => (
                  <Field
                    key={key}
                    label={
                      {
                        price: "Selling price · ₹",
                        mrp: "MRP · ₹",
                        stock: "Physical stock",
                        weight: "Weight · grams",
                        taxRate: "Tax rate · %",
                      }[key]
                    }
                  >
                    <input
                      required
                      type="number"
                      min={key === "stock" ? edit.reserved : 0}
                      step={
                        ["price", "mrp", "taxRate"].includes(key) ? "0.01" : "1"
                      }
                      value={
                        ["price", "mrp"].includes(key)
                          ? edit[key] / 100
                          : edit[key]
                      }
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          [key]: ["price", "mrp"].includes(key)
                            ? Math.round(Number(e.target.value) * 100)
                            : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ),
              )}
              <Field label="Listing status">
                <select
                  value={String(edit.enabled)}
                  onChange={(e) =>
                    setEdit({ ...edit, enabled: e.target.value === "true" })
                  }
                >
                  <option value="true">Active</option>
                  <option value="false">Paused</option>
                </select>
              </Field>
              <Field label="Category">
                <input
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({ ...edit, category: e.target.value })
                  }
                />
              </Field>
              <Field label="Variant">
                <input
                  value={edit.variant}
                  onChange={(e) =>
                    setEdit({ ...edit, variant: e.target.value })
                  }
                />
              </Field>
              <div className="span-2">
                <Field label="Image URL">
                  <input
                    type="url"
                    value={edit.image}
                    onChange={(e) =>
                      setEdit({ ...edit, image: e.target.value })
                    }
                    placeholder="https://…"
                  />
                </Field>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <Notice>
                {edit.reserved} units are reserved for existing orders and
                cannot be overwritten.
              </Notice>
            </div>
            <div className="form-footer">
              <Button secondary type="button" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button disabled={busy}>Save product</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Orders() {
  const { snapshot } = useApp();
  const filter = useFilter();
  const [status, setStatus] = useState("all");
  const [simulator, setSimulator] = useState(false);
  const router = useRouter();
  const orders = snapshot.state.orders.filter(
    (o) =>
      filter.matches(o.id, o.customer, o.pincode) &&
      (status === "all" || o.status === status),
  );
  return (
    <>
      <PageTitle
        eyebrow="FROM CHECKOUT TO DOORSTEP"
        title="Your orders"
        description="A clear view of every order, and what needs to happen next."
        action={
          <Button
            secondary
            disabled={!snapshot.state.products.length}
            onClick={() => setSimulator(true)}
          >
            <Plus size={15} />
            Test an order
          </Button>
        }
      />
      <ModeBanner />
      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Search orders"
            value={filter.search}
            onChange={(e) => filter.setSearch(e.target.value)}
            placeholder="Search orders or customers…"
          />
        </label>
        <select
          aria-label="Order status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {[
            "confirmed",
            "packed",
            "ready",
            "picked_up",
            "in_transit",
            "delivered",
            "cancelled",
            "returned",
          ].map((v) => (
            <option key={v} value={v}>
              {human(v)}
            </option>
          ))}
        </select>
      </div>
      <section className="card table-card">
        {orders.length ? (
          <OrderTable orders={orders} />
        ) : (
          <Empty
            title="No orders here yet"
            description="Orders from your connected buyers will appear here. Use a test order to explore the workflow."
          />
        )}
      </section>
      {simulator && (
        <Modal title="Try a buyer order" onClose={() => setSimulator(false)}>
          <Simulator
            allowOrder
            onCreated={(o) => router.push(`/orders/${o.id}`)}
          />
        </Modal>
      )}
    </>
  );
}
function OrderDetail({ id }: { id: string }) {
  const { snapshot, act, busy } = useApp();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const order = snapshot.state.orders.find((o) => o.id === id);
  if (!order)
    return (
      <Empty
        title="Order not found"
        description="This order is unavailable in your workspace."
        action={
          <Link className="button secondary" href="/orders">
            Back to orders
          </Link>
        }
      />
    );
  const next =
    order.status === "confirmed"
      ? "packed"
      : order.status === "packed"
        ? "ready"
        : null;
  return (
    <>
      <Link
        href="/orders"
        className="text-link row"
        style={{ marginBottom: 22 }}
      >
        <ArrowLeft size={14} />
        All orders
      </Link>
      <PageTitle
        eyebrow="ORDER DETAILS"
        title={order.id}
        description={`Placed ${new Date(order.createdAt).toLocaleString("en-IN")} · ${order.customer}`}
        action={
          <>
            <Button secondary onClick={() => window.print()}>
              <Printer size={14} />
              Print summary
            </Button>
            {next && (
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api(`/orders/${id}/transition`, { status: next }),
                    "Order updated",
                  )
                }
              >
                <Check size={14} />
                {next === "packed" ? "Mark as packed" : "Ready for pickup"}
              </Button>
            )}
          </>
        }
      />
      {order.simulated && <ModeBanner />}
      <div className="detail-grid">
        <div className="stack">
          <section className="card table-card">
            <div className="card-heading">
              <h2>Items in this order</h2>
              <Status value={order.status} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.quote.items.map((item) => (
                    <tr key={item.sku}>
                      <td>
                        <ProductName product={{ ...item, category: "" }} />
                      </td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unitPrice)}</td>
                      <td>{money(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <div className="definition">
                <span>Subtotal</span>
                <span>{money(order.quote.subtotal)}</span>
              </div>
              <div className="definition">
                <span>Discount</span>
                <span>−{money(order.quote.discount)}</span>
              </div>
              <div className="definition">
                <span>Shipping charged</span>
                <span>{money(order.quote.shipping)}</span>
              </div>
              <div className="definition">
                <span>Included tax · seller configuration</span>
                <span>{money(order.quote.includedTax)}</span>
              </div>
              <div className="definition total">
                <span>Order total</span>
                <span>{money(order.quote.total)}</span>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>Order timeline</h2>
              <Clock size={16} color="#96a28b" />
            </div>
            <div className="timeline">
              {[...order.history].reverse().map((h, i) => (
                <div className="timeline-item" key={i}>
                  {human(h.event)}
                  <small>{new Date(h.at).toLocaleString("en-IN")}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-heading">
              <h2>Delivery</h2>
              <Truck size={16} />
            </div>
            <strong style={{ fontSize: 13 }}>{order.customer}</strong>
            <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
              {order.address}
              <br />
              India · {order.pincode}
            </p>
            <hr />
            <div className="definition">
              <span>Dispatch by</span>
              <span>{order.quote.dispatchBy}</span>
            </div>
            <div className="definition">
              <span>Carrier estimate</span>
              <span>{money(order.quote.carrierCost)}</span>
            </div>
            {order.shipment ? (
              <>
                <div className="definition">
                  <span>Shipment</span>
                  <span>{order.shipment.id}</span>
                </div>
                <small>{order.shipment.provider}</small>
                <p style={{ fontSize: 12, marginTop: 8 }}>
                  {order.shipment.status}
                </p>
              </>
            ) : (
              <Button
                secondary
                className="full"
                style={{ marginTop: 15 }}
                disabled={
                  busy ||
                  !["confirmed", "packed", "ready"].includes(order.status)
                }
                onClick={() =>
                  void act(
                    () => api(`/orders/${id}/book`, {}),
                    "Simulated pickup requested",
                  )
                }
              >
                <Truck size={14} />
                Arrange test pickup
              </Button>
            )}
          </section>
          <section className="card">
            <h2>Payment & policies</h2>
            <div className="definition" style={{ marginTop: 12 }}>
              <span>Payment</span>
              <Badge tone={order.simulated ? "amber" : "neutral"}>
                {human(order.payment)}
              </Badge>
            </div>
            <div className="definition">
              <span>Business rules</span>
              <span>Version {order.quote.ruleVersion}</span>
            </div>
            <div className="definition">
              <span>Return window</span>
              <span>{order.rules.returnDays} days</span>
            </div>
            <small>The quote and policies are preserved from checkout.</small>
          </section>
          {["confirmed", "packed", "ready"].includes(order.status) && (
            <Button
              secondary
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel order
            </Button>
          )}
          <Link className="text-link" href="/support">
            Open a support or return request
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
      {confirmCancel && (
        <Modal
          title="Cancel this order?"
          onClose={() => setConfirmCancel(false)}
        >
          <p>
            Reserved stock will be released. Any real refund requires the
            configured payment workflow.
          </p>
          <div className="form-footer">
            <Button secondary onClick={() => setConfirmCancel(false)}>
              Keep order
            </Button>
            <Button
              className="danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api(`/orders/${id}/transition`, {
                    status: "cancelled",
                  });
                  setConfirmCancel(false);
                }, "Order cancelled")
              }
            >
              Confirm cancellation
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Deliveries() {
  const { snapshot, act, busy } = useApp();
  const orders = snapshot.state.orders.filter((o) => o.shipment);
  const ready = snapshot.state.orders.filter(
    (o) => ["confirmed", "packed", "ready"].includes(o.status) && !o.shipment,
  );
  const next = (o: Order) =>
    o.status === "ready"
      ? "picked_up"
      : o.status === "picked_up"
        ? "in_transit"
        : o.status === "in_transit"
          ? "delivered"
          : null;
  return (
    <>
      <PageTitle
        eyebrow="THE LAST MILE"
        title="Deliveries"
        description="From your pickup address to your customer’s doorstep."
      />
      <ModeBanner />
      {ready.length > 0 && (
        <section className="card" style={{ marginBottom: 22 }}>
          <div className="card-heading">
            <h2>Waiting for a shipment</h2>
            <Badge tone="amber">{ready.length} orders</Badge>
          </div>
          {ready.map((o) => (
            <div className="activity-item" key={o.id}>
              <div>
                <Link href={`/orders/${o.id}`} className="text-link">
                  {o.id}
                </Link>
                <p>
                  {o.customer} · {o.pincode}
                </p>
              </div>
              <Button
                secondary
                className="small"
                style={{ marginLeft: "auto" }}
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api(`/orders/${o.id}/book`, {}),
                    "Test pickup requested",
                  )
                }
              >
                Arrange test pickup
              </Button>
            </div>
          ))}
        </section>
      )}
      <section className="card table-card">
        <div className="card-heading">
          <h2>Shipment tracker</h2>
          <Badge>{orders.length} shipments</Badge>
        </div>
        {orders.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Order</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.shipment!.id}
                      <small style={{ display: "block", marginTop: 4 }}>
                        {o.pincode}
                      </small>
                    </td>
                    <td>
                      <Link className="text-link" href={`/orders/${o.id}`}>
                        {o.id}
                      </Link>
                    </td>
                    <td className="subtle">{o.shipment!.provider}</td>
                    <td>
                      <Status value={o.status} />
                    </td>
                    <td>
                      {o.simulated && next(o) ? (
                        <Button
                          secondary
                          className="small"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                api(`/orders/${o.id}/simulate-delivery`, {
                                  status: next(o),
                                }),
                              "Simulated delivery event received",
                            )
                          }
                        >
                          Simulate {human(next(o)!)}
                        </Button>
                      ) : (
                        <small>
                          {o.status === "packed"
                            ? "Mark order ready for pickup"
                            : o.status === "delivered"
                              ? "Delivery complete"
                              : "See order details"}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your parcels will appear here"
            description="Arrange pickup for an order to start following its delivery."
          />
        )}
      </section>
      <div style={{ marginTop: 22 }}>
        <Notice>
          These deliveries use a local simulator. Live coverage, carrier quotes,
          labels and tracking require an activated ONDC logistics integration.
        </Notice>
      </div>
    </>
  );
}
function Payments() {
  const { snapshot } = useApp();
  const orders = snapshot.state.orders;
  return (
    <>
      <PageTitle
        eyebrow="KEEP THE NUMBERS CLEAR"
        title="Payments & settlements"
        description="Understand order values and track payment records."
        action={
          <a className="button secondary" href="/api/payments/export">
            <Download size={14} />
            Export records
          </a>
        }
      />
      <ModeBanner />
      <div className="metrics" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          [
            "Simulated order value",
            money(
              orders
                .filter((o) => o.simulated)
                .reduce((sum, o) => sum + o.quote.total, 0),
            ),
          ],
          [
            "Real payments verified",
            money(
              orders
                .filter((o) => !o.simulated && o.payment === "paid")
                .reduce((sum, o) => sum + o.quote.total, 0),
            ),
          ],
          ["Settlement integration", "Not connected"],
        ].map(([label, value]) => (
          <div className="card metric" key={label}>
            <div className="metric-label">{label}</div>
            <div
              className="metric-value"
              style={{ fontSize: value === "Not connected" ? 19 : 27 }}
            >
              {value}
            </div>
            <small>No automatic payout is implied.</small>
          </div>
        ))}
      </div>
      <section className="card table-card">
        <div className="card-heading">
          <h2>Order payment records</h2>
        </div>
        {orders.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Order total</th>
                  <th>Customer shipping</th>
                  <th>Carrier estimate</th>
                  <th>Payment</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="text-link" href={`/orders/${o.id}`}>
                        {o.id}
                      </Link>
                    </td>
                    <td>{money(o.quote.total)}</td>
                    <td>{money(o.quote.shipping)}</td>
                    <td>{money(o.quote.carrierCost)}</td>
                    <td>
                      <Badge tone={o.simulated ? "amber" : "neutral"}>
                        {human(o.payment)}
                      </Badge>
                    </td>
                    <td className="subtle">
                      {o.simulated ? "Not applicable" : "Not connected"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No payment records yet"
            description="Order payment records will appear after your first test order."
          />
        )}
      </section>
    </>
  );
}
function Support() {
  const { snapshot, act, busy } = useApp();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [orderId, setOrderId] = useState(snapshot.state.orders[0]?.id ?? "");
  const [type, setType] = useState<Ticket["type"]>("delivery");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="LOOK AFTER EVERY CUSTOMER"
        title="Returns & support"
        description="Keep issues, conversations and resolutions together."
        action={
          <Button
            disabled={!snapshot.state.orders.length}
            onClick={() => setCreating(true)}
          >
            <Plus size={14} />
            New request
          </Button>
        }
      />
      <section className="card table-card">
        {snapshot.state.tickets.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Order</th>
                  <th>Reason</th>
                  <th>Opened</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshot.state.tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{human(t.type)}</td>
                    <td>
                      <Link className="text-link" href={`/orders/${t.orderId}`}>
                        {t.orderId}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 260 }}>{t.reason}</td>
                    <td>{date(t.createdAt)}</td>
                    <td>
                      <Status value={t.status} />
                    </td>
                    <td>
                      <Button
                        secondary
                        className="small"
                        onClick={() => {
                          setSelected(t);
                          setResolution(t.resolution ?? "");
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="A clear desk. A good feeling."
            description="Returns, delivery issues and support requests will be organised here."
          />
        )}
      </section>
      <div style={{ marginTop: 22 }}>
        <Notice>
          Resolving a support ticket records the outcome. Refunds, physical
          stock inspection and network grievance submission remain separate
          actions.
        </Notice>
      </div>
      {creating && (
        <Modal title="New support request" onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () => api("/tickets", { orderId, type, reason }),
                  "Request created",
                )
              ) {
                setCreating(false);
                setReason("");
              }
            }}
          >
            <div className="fields">
              <Field label="Order">
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  {snapshot.state.orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} · {o.customer}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Request type">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  {["delivery", "return", "cancellation", "other"].map((t) => (
                    <option key={t} value={t}>
                      {human(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="span-2">
                <Field label="What happened?">
                  <textarea
                    required
                    minLength={5}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="form-footer">
              <Button disabled={busy}>Create request</Button>
            </div>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`Review ${human(selected.type)} request`}
          onClose={() => setSelected(null)}
        >
          <div className="stack">
            <p>{selected.reason}</p>
            <Field label="Resolution notes">
              <textarea
                rows={4}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Record the agreed action or next step."
              />
            </Field>
            {selected.resolution && (
              <small>Previous notes: {selected.resolution}</small>
            )}
            <div className="form-footer">
              <Button
                secondary
                disabled={busy || resolution.trim().length < 3}
                onClick={() =>
                  void act(async () => {
                    await api(
                      `/tickets/${selected.id}`,
                      { status: "reviewing", resolution },
                      "PUT",
                    );
                    setSelected(null);
                  }, "Request updated")
                }
              >
                Mark reviewing
              </Button>
              <Button
                disabled={busy || resolution.trim().length < 3}
                onClick={() =>
                  void act(async () => {
                    await api(
                      `/tickets/${selected.id}`,
                      { status: "resolved", resolution },
                      "PUT",
                    );
                    setSelected(null);
                  }, "Request resolved")
                }
              >
                Resolve request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function Settings() {
  const { snapshot } = useApp();
  const [tab, setTab] = useState("business");
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        title="Business & connection settings"
        description="Manage your profile, seller service and network readiness."
      />
      <div className="tabs">
        {[
          ["business", "Business profile"],
          ["service", "Seller service"],
          ["connection", "Network connection"],
          ["activity", "Activity history"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="card">
        {tab === "business" && <BusinessForm />}
        {tab === "service" && <BuildPanel />}
        {tab === "connection" && (
          <div className="stack">
            <div className="card-heading">
              <div>
                <h2>Your ONDC connection</h2>
                <p>
                  Local testing is available. Production integrations are not
                  activated.
                </p>
              </div>
              <Badge tone="amber">Setup pending</Badge>
            </div>
            {[
              ["Retail seller service", "Local endpoint available"],
              [
                "ONDC participant onboarding",
                "Pending participant/subscriber setup",
              ],
              ["Logistics partner", "Local simulator only"],
              ["Payments & settlements", "No live provider connected"],
              [
                "Cline SDK",
                snapshot.integrations.cline
                  ? "Configured · live model calls available"
                  : "Add a model-provider key to enable",
              ],
              ["Cloud deployment", "Local development environment"],
            ].map(([label, value]) => (
              <div className="definition" key={label}>
                <span>{label}</span>
                <strong style={{ fontSize: 12, textAlign: "right" }}>
                  {value}
                </strong>
              </div>
            ))}
            <Notice>
              Keep credentials in the server environment. This screen never
              displays signing keys or provider API keys.
            </Notice>
            <details>
              <summary className="text-link" style={{ cursor: "pointer" }}>
                Advanced service details
              </summary>
              <div className="stack" style={{ marginTop: 20 }}>
                <Field label="Local retail endpoint">
                  <input readOnly value={`/protocol/${snapshot.id}/{action}`} />
                </Field>
                <p className="subtle" style={{ fontSize: 12 }}>
                  Retail target: ONDC 1.2.5. Local validation covers supported
                  flows; official domain validation, onboarding, signed registry
                  access and partner tests are required before live activation.
                </p>
                <ProtocolTest />
              </div>
            </details>
          </div>
        )}
        {tab === "activity" && (
          <>
            <div className="card-heading">
              <h2>Workspace activity</h2>
              <Badge>{snapshot.state.audit.length} events</Badge>
            </div>
            {snapshot.state.audit.length ? (
              <div className="timeline">
                {snapshot.state.audit.slice(0, 60).map((a, i) => (
                  <div className="timeline-item" key={i}>
                    <strong>{human(a.action.replaceAll(".", " "))}</strong>
                    <p
                      className="subtle"
                      style={{ fontSize: 11, marginTop: 4 }}
                    >
                      {a.detail}
                    </p>
                    <small>{new Date(a.at).toLocaleString("en-IN")}</small>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Your activity will appear here"
                description="Changes to inventory, orders and settings are recorded automatically."
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
function ProtocolTest() {
  const { snapshot, act, busy } = useApp();
  const [events, setEvents] = useState<
    { action: string; status: string; detail: string }[]
  >([]);
  return (
    <div className="stack">
      <Button
        secondary
        disabled={busy || !snapshot.state.products.length}
        onClick={() =>
          void act(async () => {
            const result = await api<{ events: typeof events }>(
              "/protocol/simulate",
              {},
            );
            setEvents(result.events);
          }, "Local protocol flow completed")
        }
      >
        <FlaskConical size={14} />
        Run Beckn flow simulation
      </Button>
      {events.length > 0 && (
        <div className="build-log">
          {events.map((e, i) => (
            <div key={i}>
              <span className="timestamp">{e.action}</span>
              {e.status} · {e.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
