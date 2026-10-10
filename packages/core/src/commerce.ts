import { randomUUID } from "node:crypto";
import {
  assert,
  cartSchema,
  productSchema,
  rulesSchema,
  record,
  type Cart,
  type MerchantState,
  type Order,
  type OrderStatus,
  type Product,
  type Quote,
  type Rules,
  type ShippingQuote,
} from "./domain";

export function available(product: Product, rules: Rules) {
  return Math.max(0, product.stock - product.reserved - rules.safetyStock);
}
function lines(cart: Cart) {
  const totals = new Map<string, number>();
  for (const item of cart.items)
    totals.set(item.sku, (totals.get(item.sku) ?? 0) + item.quantity);
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, quantity]) => ({ sku, quantity }));
}
export function dispatchDate(rules: Rules, now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000);
  const [hours, minutes] = rules.cutoff.split(":").map(Number);
  if (local.getUTCHours() * 60 + local.getUTCMinutes() >= hours * 60 + minutes)
    local.setUTCDate(local.getUTCDate() + 1);
  while (!rules.workingDays.includes(local.getUTCDay()))
    local.setUTCDate(local.getUTCDate() + 1);
  for (let left = rules.dispatchDays; left > 0;) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (rules.workingDays.includes(local.getUTCDay())) left--;
  }
  return local.toISOString().slice(0, 10);
}
export function quoteCart(
  state: MerchantState,
  input: Cart,
  shipping: ShippingQuote,
): Quote {
  const cart = cartSchema.parse(input);
  const rules = state.rules;
  assert(rules.acceptingOrders, "New orders are paused");
  assert(
    !rules.excludedPincodes.includes(cart.pincode),
    "This pincode is excluded",
  );
  assert(
    shipping.serviceable,
    "No delivery service is available for this pincode",
  );
  assert(
    Date.parse(shipping.expiresAt) > Date.now(),
    "The delivery quote has expired",
  );
  assert(
    Number.isSafeInteger(shipping.cost) && shipping.cost >= 0,
    "Invalid carrier price",
  );
  const items = lines(cart).map((item) => {
    const p = state.products.find((p) => p.sku === item.sku && p.enabled);
    assert(p, `Product ${item.sku} is unavailable`);
    assert(
      item.quantity <= rules.maxPerItem,
      `${p.name}: maximum quantity is ${rules.maxPerItem}`,
    );
    assert(
      available(p, rules) >= item.quantity,
      `${p.name}: insufficient available stock`,
    );
    return {
      ...item,
      name: p.name,
      unitPrice: p.price,
      total: p.price * item.quantity,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discount = Math.round((subtotal * rules.discountPercent) / 100);
  const discounted = subtotal - discount;
  assert(
    discounted >= rules.minOrder,
    `Minimum order value is ₹${(rules.minOrder / 100).toFixed(2)}`,
  );
  let fee =
    rules.shippingMode === "free"
      ? 0
      : rules.shippingMode === "flat"
        ? rules.flatShipping
        : shipping.cost;
  if (rules.freeShippingAbove !== null && discounted >= rules.freeShippingAbove)
    fee = 0;
  const includedTax = items.reduce((sum, item) => {
    const p = state.products.find((p) => p.sku === item.sku)!;
    const gross = Math.round(item.total * (1 - rules.discountPercent / 100));
    return sum + Math.round((gross * p.taxRate) / (100 + p.taxRate));
  }, 0);
  return {
    items,
    subtotal,
    discount,
    shipping: fee,
    carrierCost: shipping.cost,
    total: discounted + fee,
    includedTax,
    ruleVersion: state.ruleVersion,
    dispatchBy: dispatchDate(rules),
    shippingQuote: structuredClone(shipping),
  };
}
export function placeOrder(
  state: MerchantState,
  input: Cart,
  shipping: ShippingQuote,
  status: "confirmed" | "reserved" = "confirmed",
): Order {
  const cart = cartSchema.parse(input);
  const existing = state.orders.find((o) => o.key === cart.idempotencyKey);
  if (existing) {
    assert(
      existing.pincode === cart.pincode &&
        existing.customer === cart.customer &&
        existing.address === cart.address &&
        JSON.stringify(
          existing.quote.items.map(({ sku, quantity }) => ({ sku, quantity })),
        ) === JSON.stringify(lines(cart)),
      "Idempotency key was already used for a different order",
      409,
    );
    return existing;
  }
  const quote = quoteCart(state, cart, shipping);
  const now = new Date().toISOString();
  const order: Order = {
    id: `AB-${randomUUID().slice(0, 8).toUpperCase()}`,
    key: cart.idempotencyKey,
    customer: cart.customer,
    address: cart.address,
    pincode: cart.pincode,
    quote,
    rules: structuredClone(state.rules),
    status,
    simulated: shipping.simulated,
    payment: shipping.simulated ? "simulated_paid" : "pending",
    createdAt: now,
    updatedAt: now,
    history: [
      {
        at: now,
        event:
          status === "reserved"
            ? "Stock reserved for checkout"
            : "Order confirmed",
      },
    ],
  };
  if (status === "reserved")
    order.reservationExpiresAt = new Date(
      Date.now() + 10 * 60000,
    ).toISOString();
  for (const item of quote.items)
    state.products.find((p) => p.sku === item.sku)!.reserved += item.quantity;
  state.inventoryVersion++;
  state.orders.unshift(order);
  record(state, "order.created", order.id);
  return order;
}
const transitions: Record<OrderStatus, OrderStatus[]> = {
  reserved: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "delivery_failed", "returned"],
  in_transit: ["delivered", "delivery_failed", "returned"],
  delivery_failed: ["in_transit", "delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};
export function transitionOrder(
  state: MerchantState,
  id: string,
  status: OrderStatus,
) {
  const order = state.orders.find((o) => o.id === id);
  assert(order, "Order not found", 404);
  if (order.status === status) return order;
  assert(
    transitions[order.status].includes(status),
    `Invalid transition from ${order.status} to ${status}`,
    409,
  );
  if (status === "confirmed" && order.reservationExpiresAt)
    assert(
      Date.parse(order.reservationExpiresAt) > Date.now(),
      "Reservation expired; start checkout again",
      409,
    );
  if (status === "cancelled" && order.status !== "reserved") {
    const rank = { confirmed: 0, packed: 1, ready: 2 };
    assert(
      rank[order.status as keyof typeof rank] <=
        rank[order.rules.cancellationUntil],
      "Cancellation window has closed",
      409,
    );
  }
  if (status === "cancelled" || status === "picked_up") {
    for (const item of order.quote.items) {
      const product = state.products.find((p) => p.sku === item.sku);
      assert(
        product && product.reserved >= item.quantity,
        "Inventory reservation is inconsistent",
        409,
      );
    }
    for (const item of order.quote.items) {
      const p = state.products.find((p) => p.sku === item.sku)!;
      p.reserved -= item.quantity;
      if (status === "picked_up") p.stock -= item.quantity;
    }
    state.inventoryVersion++;
  }
  // Returned parcels require a stock inspection; do not automatically resell them.
  if (status === "cancelled" && order.payment === "paid")
    order.payment = "refund_pending";
  if (status === "returned" && order.payment === "paid")
    order.payment = "refund_pending";
  order.status = status;
  order.updatedAt = new Date().toISOString();
  order.history.push({
    at: order.updatedAt,
    event: status.replaceAll("_", " "),
  });
  record(state, "order.updated", `${id}: ${status}`);
  return order;
}
export function expireReservations(state: MerchantState) {
  let count = 0;
  for (const order of state.orders)
    if (
      order.status === "reserved" &&
      Date.parse(order.reservationExpiresAt ?? "") <= Date.now()
    ) {
      transitionOrder(state, order.id, "cancelled");
      count++;
    }
  return count;
}
export function importProducts(
  state: MerchantState,
  input: Product[],
  expectedVersion: number,
) {
  assert(
    state.inventoryVersion === expectedVersion,
    "Inventory changed since this preview. Upload or preview again.",
    409,
  );
  assert(
    input.length > 0 && input.length <= 5000,
    "Import between 1 and 5,000 products",
  );
  const incoming = input.map((p) => productSchema.parse(p));
  const unique = new Set(incoming.map((p) => p.sku));
  assert(unique.size === incoming.length, "Duplicate product codes in import");
  const next = incoming.map((p) => {
    const old = state.products.find((old) => old.sku === p.sku);
    const reserved = old?.reserved ?? 0;
    assert(
      p.stock >= reserved,
      `${p.sku}: physical stock cannot be less than reserved stock`,
    );
    return { ...p, reserved };
  });
  state.products = [
    ...state.products.filter((p) => !unique.has(p.sku)),
    ...next,
  ];
  state.inventoryVersion++;
  record(
    state,
    "inventory.imported",
    `${incoming.length} products; version ${state.inventoryVersion}`,
  );
  return incoming.length;
}
export function changeRules(
  state: MerchantState,
  input: Rules,
  expectedVersion: number,
) {
  assert(
    state.ruleVersion === expectedVersion,
    "Rules changed in another session. Reload and try again.",
    409,
  );
  state.rules = rulesSchema.parse(input);
  state.ruleVersion++;
  record(state, "rules.updated", `Version ${state.ruleVersion}`);
  return state.rules;
}
