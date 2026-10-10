"use client";
import { useState } from "react";
import {
  ArrowRight,
  Save,
  Upload,
  FileSpreadsheet,
  Check,
  FlaskConical,
  Package,
} from "lucide-react";
import type {
  Business,
  Rules,
  Quote,
  Product,
  Order,
} from "../../../packages/core/src/domain";
import {
  Button,
  Field,
  Notice,
  useApp,
  api,
  money,
  Spinner,
  Badge,
} from "./ui";

export function BusinessForm({ onSaved }: { onSaved?: () => void }) {
  const { snapshot, act, busy } = useApp();
  const original = snapshot.state.business;
  const [form, setForm] = useState<Business>(
    original ?? {
      name: "",
      owner: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      pincode: "",
      domain: "ONDC:RET10",
      registration: "",
      participation: "undecided",
    },
  );
  const field = (
    key: keyof Business,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label}>
      <input
        required
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </Field>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act(
            () => api("/business", form, "PUT"),
            "Business details saved",
          )
        )
          onSaved?.();
      }}
    >
      <div className="fields">
        {field("name", "Business name", { placeholder: "e.g. Aaranya Pantry" })}
        {field("owner", "Your name", {
          placeholder: "Business owner or manager",
        })}
        {field("email", "Business email", {
          type: "email",
          placeholder: "hello@yourbusiness.in",
        })}
        {field("phone", "Phone number", {
          placeholder: "10-digit mobile number",
          pattern: "[6-9][0-9]{9}",
        })}
        <Field label="What do you sell?">
          <select
            value={form.domain}
            onChange={(e) =>
              setForm({ ...form, domain: e.target.value as Business["domain"] })
            }
          >
            <option value="ONDC:RET10">Grocery & packaged food</option>
            <option value="ONDC:RET12">Fashion & accessories</option>
            <option value="ONDC:RET13">Beauty & personal care</option>
            <option value="ONDC:RET14">Electronics</option>
            <option value="ONDC:RET15">Home & decor</option>
          </select>
        </Field>
        {field("registration", "Business registration reference", {
          required: false,
          placeholder: "GSTIN / applicable registration",
        })}
        <div className="span-2">
          {field("address", "Pickup address", {
            placeholder: "Street, building and locality",
            minLength: 8,
          })}
        </div>
        {field("city", "City", { placeholder: "New Delhi" })}
        {field("pincode", "Pickup pincode", {
          pattern: "[1-9][0-9]{5}",
          placeholder: "110016",
        })}
        <div className="span-2">
          <Field
            label="How will you join ONDC?"
            hint="You can decide this later. Actual network activation requires the applicable participant setup."
          >
            <select
              value={form.participation}
              onChange={(e) =>
                setForm({
                  ...form,
                  participation: e.target.value as Business["participation"],
                })
              }
            >
              <option value="undecided">I need help choosing</option>
              <option value="inventory_seller">
                Our own seller node — we manufacture our products
              </option>
              <option value="existing_seller_app">
                Through an existing seller application
              </option>
            </select>
          </Field>
        </div>
      </div>
      <div className="form-footer">
        <Button disabled={busy}>
          {onSaved ? "Save & continue" : "Save details"}
          <ArrowRight size={15} />
        </Button>
      </div>
    </form>
  );
}
export function RulesForm({ onSaved }: { onSaved?: () => void }) {
  const { snapshot, act, busy } = useApp();
  const [rules, setRules] = useState<Rules>(snapshot.state.rules);
  const [version, setVersion] = useState(snapshot.state.ruleVersion);
  const amount = (
    key: "minOrder" | "flatShipping" | "freeShippingAbove",
    label: string,
  ) => (
    <Field label={label}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={rules[key] === null ? "" : rules[key]! / 100}
        placeholder={
          key === "freeShippingAbove" ? "Leave empty to disable" : ""
        }
        onChange={(e) =>
          setRules({
            ...rules,
            [key]:
              e.target.value === "" && key === "freeShippingAbove"
                ? null
                : Math.round(Number(e.target.value) * 100),
          })
        }
      />
    </Field>
  );
  const count = (
    key:
      | "maxPerItem"
      | "safetyStock"
      | "lowStock"
      | "dispatchDays"
      | "discountPercent"
      | "returnDays",
    label: string,
    max: number,
  ) => (
    <Field label={label}>
      <input
        type="number"
        min={key === "maxPerItem" ? 1 : 0}
        max={max}
        required
        value={rules[key]}
        onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
      />
    </Field>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act(
            () => api("/rules", { rules, version }, "PUT"),
            "Business rules saved",
          )
        ) {
          setVersion(version + 1);
          onSaved?.();
        }
      }}
    >
      <div className="card-heading">
        <div>
          <h2>Order & inventory rules</h2>
          <p>Keep your everyday decisions in one place.</p>
        </div>
        <Badge>Version {version}</Badge>
      </div>
      <div className="fields">
        {amount("minOrder", "Minimum order value · ₹")}
        {count("maxPerItem", "Maximum quantity per product", 10000)}
        {count("safetyStock", "Stock to keep aside per product", 10000)}
        {count("lowStock", "Low-stock alert below", 10000)}
        {count("discountPercent", "Catalogue discount · %", 90)}
        <Field label="Taking new orders">
          <select
            value={String(rules.acceptingOrders)}
            onChange={(e) =>
              setRules({ ...rules, acceptingOrders: e.target.value === "true" })
            }
          >
            <option value="true">Yes, accept orders</option>
            <option value="false">Pause new orders</option>
          </select>
        </Field>
      </div>
      <hr />
      <div className="card-heading">
        <div>
          <h2>Shipping & dispatch</h2>
          <p>Delivery across India, wherever your partner can service.</p>
        </div>
      </div>
      <div className="fields">
        <Field label="Shipping charged to customer">
          <select
            value={rules.shippingMode}
            onChange={(e) =>
              setRules({
                ...rules,
                shippingMode: e.target.value as Rules["shippingMode"],
              })
            }
          >
            <option value="actual">Actual delivery quote</option>
            <option value="flat">Flat delivery charge</option>
            <option value="free">Business pays all shipping</option>
          </select>
        </Field>
        {rules.shippingMode === "flat" ? (
          amount("flatShipping", "Flat delivery charge · ₹")
        ) : (
          <Field label="Delivery selection">
            <select
              value={rules.logisticsPreference}
              onChange={(e) =>
                setRules({
                  ...rules,
                  logisticsPreference: e.target
                    .value as Rules["logisticsPreference"],
                })
              }
            >
              <option value="lowest_price">Lowest delivery price</option>
              <option value="fastest">Fastest delivery</option>
            </select>
          </Field>
        )}
        {amount("freeShippingAbove", "Free shipping from · ₹")}
        {count("dispatchDays", "Processing time · working days", 30)}
        <Field label="Daily order cutoff · IST">
          <input
            required
            type="time"
            value={rules.cutoff}
            onChange={(e) => setRules({ ...rules, cutoff: e.target.value })}
          />
        </Field>
        <Field label="Working days">
          <div className="working-days">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <label className="day" key={day}>
                  <input
                    type="checkbox"
                    checked={rules.workingDays.includes(index)}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        workingDays: e.target.checked
                          ? [...rules.workingDays, index]
                          : rules.workingDays.filter((d) => d !== index),
                      })
                    }
                  />
                  {day}
                </label>
              ),
            )}
          </div>
        </Field>
        <div className="span-2">
          <Field
            label="Excluded pincodes"
            hint="Separate pincodes with commas. Live carrier coverage is checked separately."
          >
            <input
              value={rules.excludedPincodes.join(", ")}
              onChange={(e) =>
                setRules({
                  ...rules,
                  excludedPincodes: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
              placeholder="e.g. 110001, 560001"
            />
          </Field>
        </div>
      </div>
      <hr />
      <div className="card-heading">
        <div>
          <h2>After an order</h2>
          <p>These settings stay attached to each confirmed order.</p>
        </div>
      </div>
      <div className="fields">
        {count("returnDays", "Return-request window · days", 30)}
        <Field label="Allow cancellation until">
          <select
            value={rules.cancellationUntil}
            onChange={(e) =>
              setRules({
                ...rules,
                cancellationUntil: e.target.value as Rules["cancellationUntil"],
              })
            }
          >
            <option value="confirmed">Order confirmed</option>
            <option value="packed">Order packed</option>
            <option value="ready">Ready for pickup</option>
          </select>
        </Field>
        <div className="span-2">
          <Field
            label="Any special requirements?"
            hint="Recorded for review. Free text never silently becomes an active business rule."
          >
            <textarea
              rows={3}
              value={rules.specialInstructions}
              onChange={(e) =>
                setRules({ ...rules, specialInstructions: e.target.value })
              }
              placeholder="Tell us about exceptions or requirements we should review."
            />
          </Field>
        </div>
      </div>
      <div className="form-footer">
        <small>
          Applies to future orders. Prices in existing orders stay unchanged.
        </small>
        <Button disabled={busy}>
          {onSaved ? "Save & continue" : "Save rules"}
          <Save size={15} />
        </Button>
      </div>
    </form>
  );
}

export type ImportPreview = {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string>;
  products: Product[];
  errors: { row: number; field: string; message: string }[];
  version: number;
};
export function InventoryUpload({
  onPreview,
  onSample,
}: {
  onPreview: (preview: ImportPreview) => void;
  onSample?: () => void;
}) {
  const { act, busy } = useApp();
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="stack">
      <div className="dropzone">
        <FileSpreadsheet size={36} color="#789563" />
        <h3>Your inventory. Your format.</h3>
        <p>Bring your Excel or CSV file. We’ll help you organise it.</p>
        <a className="button secondary" href="/api/inventory/template">
          <FileSpreadsheet size={15} />
          Download Excel template
        </a>
        <label>
          <span className="hidden-label">Inventory file</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p style={{ margin: "12px 0 0", fontSize: 10 }}>
          XLSX or CSV · up to 5 MB · 5,000 products
        </p>
      </div>
      <Notice>
        Include a unique product code, selling price, physical stock and weight.
        Reservations are preserved when you update stock.
      </Notice>
      <div className="form-footer">
        {onSample && (
          <Button
            ghost
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await api("/inventory/sample", {});
                onSample();
              }, "Sample catalogue added")
            }
          >
            Use sample inventory
          </Button>
        )}
        <Button
          disabled={!file || busy}
          onClick={() =>
            void act(async () => {
              const data = new FormData();
              data.append("file", file!);
              onPreview(await api<ImportPreview>("/inventory/preview", data));
            })
          }
        >
          {busy ? <Spinner /> : <Upload size={15} />}Review inventory
        </Button>
      </div>
    </div>
  );
}
export function InventoryReview({
  preview,
  setPreview,
  onImported,
}: {
  preview: ImportPreview;
  setPreview: (value: ImportPreview) => void;
  onImported: () => void;
}) {
  const { act, busy } = useApp();
  const [dirty, setDirty] = useState(false);
  const labels: Record<string, string> = {
    sku: "Product code",
    name: "Product name",
    price: "Selling price · ₹",
    mrp: "MRP · ₹",
    stock: "Physical stock",
    weight: "Weight · grams",
    category: "Category",
    variant: "Variant",
    length: "Length · cm",
    width: "Width · cm",
    height: "Height · cm",
    taxRate: "Tax rate · %",
    image: "Image URL",
  };
  const validate = () =>
    act(async () => {
      const result = await api<Pick<ImportPreview, "products" | "errors">>(
        "/inventory/map",
        preview,
      );
      setPreview({ ...preview, ...result });
      setDirty(false);
    });
  return (
    <div className="stack">
      <div>
        <Notice>
          Match your columns below. Prices are in rupees. We never use purchase
          cost as the selling price.
        </Notice>
        <div className="mapping-grid">
          {Object.keys(labels).map((key) => (
            <Field key={key} label={labels[key]}>
              <select
                value={preview.mapping[key] ?? ""}
                onChange={(e) => {
                  setPreview({
                    ...preview,
                    mapping: { ...preview.mapping, [key]: e.target.value },
                  });
                  setDirty(true);
                }}
              >
                <option value="">Choose column / use default</option>
                {preview.headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </div>
      {preview.errors.length > 0 && (
        <Notice tone="error">
          <strong>{preview.errors.length} issues to resolve</strong>
          <ul>
            {preview.errors.slice(0, 8).map((error, i) => (
              <li key={i}>
                Row {error.row}, {error.field}: {error.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="table-wrap raw-table">
        <table>
          <thead>
            <tr>
              {preview.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 30).map((row, index) => (
              <tr key={index}>
                {preview.headers.map((h) => (
                  <td key={h}>
                    <input
                      aria-label={`Row ${index + 2} ${h}`}
                      value={row[h]}
                      onChange={(e) => {
                        const rows = preview.rows.map((r, i) =>
                          i === index ? { ...r, [h]: e.target.value } : r,
                        );
                        setPreview({ ...preview, rows });
                        setDirty(true);
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        Showing the first {Math.min(30, preview.rows.length)} of{" "}
        {preview.rows.length} rows. All rows are validated. For later rows,
        correct the spreadsheet and upload it again.
      </small>
      <div className="form-footer">
        <Button secondary onClick={() => void validate()} disabled={busy}>
          <Check size={15} />
          Validate changes
        </Button>
        <Button
          disabled={busy || dirty || preview.errors.length > 0}
          onClick={() =>
            void act(async () => {
              await api("/inventory/import", preview);
              onImported();
            }, `${preview.products.length} products imported`)
          }
        >
          Import {preview.products.length} products
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
export function Simulator({
  allowOrder = false,
  onCreated,
}: {
  allowOrder?: boolean;
  onCreated?: (order: Order) => void;
}) {
  const { snapshot, act, busy } = useApp();
  const products = snapshot.state.products.filter((p) => p.enabled);
  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("560001");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const cart = {
    items: [{ sku, quantity }],
    pincode,
    customer: "Test customer",
    address: "Simulation address — no real shipment",
    idempotencyKey: key,
  };
  const reset = () => {
    setQuote(null);
    setKey(crypto.randomUUID());
  };
  return (
    <div className="stack">
      <Notice>
        <FlaskConical size={14} /> Local buyer and delivery simulation. No real
        payment or shipment will be created.
      </Notice>
      <div className="fields">
        <div className="span-2">
          <Field label="Product">
            <select
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                reset();
              }}
            >
              {products.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Quantity">
          <input
            type="number"
            min="1"
            max="10000"
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
              reset();
            }}
          />
        </Field>
        <Field label="Delivery pincode">
          <input
            value={pincode}
            maxLength={6}
            onChange={(e) => {
              setPincode(e.target.value);
              reset();
            }}
          />
        </Field>
      </div>
      <Button
        secondary
        disabled={!sku || busy}
        onClick={() =>
          void act(async () =>
            setQuote(await api<Quote>("/simulator/quote", cart)),
          )
        }
      >
        <FlaskConical size={15} />
        Calculate test quote
      </Button>
      {quote && (
        <div className="card" style={{ background: "#f8faf5" }}>
          <div className="definition">
            <span>Products</span>
            <span>{money(quote.subtotal)}</span>
          </div>
          <div className="definition">
            <span>Discount</span>
            <span>− {money(quote.discount)}</span>
          </div>
          <div className="definition">
            <span>Customer shipping charge</span>
            <span>{money(quote.shipping)}</span>
          </div>
          <div className="definition">
            <span>Estimated carrier cost</span>
            <span>{money(quote.carrierCost)}</span>
          </div>
          <div className="definition">
            <span>Dispatch by</span>
            <span>{quote.dispatchBy}</span>
          </div>
          <div className="definition total">
            <span>Total</span>
            <span>{money(quote.total)}</span>
          </div>
          <small>
            Rule version {quote.ruleVersion} · {quote.shippingQuote.provider}
          </small>
        </div>
      )}
      {allowOrder && quote && (
        <Button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const order = await api<Order>("/simulator/order", cart);
              setQuote(null);
              setKey(crypto.randomUUID());
              onCreated?.(order);
            }, "Test order created")
          }
        >
          <Package size={15} />
          Place simulated order
        </Button>
      )}
    </div>
  );
}
