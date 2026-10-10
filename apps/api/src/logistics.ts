import { randomUUID } from "node:crypto";
import {
  assert,
  type Cart,
  type MerchantState,
  type ShippingQuote,
} from "../../../packages/core/src/domain";

export function simulatorRates(
  state: MerchantState,
  cart: Cart,
): ShippingQuote[] {
  const weight = cart.items.reduce(
    (sum, item) =>
      sum +
      (state.products.find((p) => p.sku === item.sku)?.weight ?? 0) *
        item.quantity,
    0,
  );
  const base = 3900 + Math.ceil(weight / 500) * 1000;
  const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  return [
    {
      id: randomUUID(),
      provider: "Parcel Standard · simulator",
      cost: base,
      estimatedDays: 5,
      serviceable: cart.pincode !== "999999",
      simulated: true,
      expiresAt,
    },
    {
      id: randomUUID(),
      provider: "Parcel Express · simulator",
      cost: base + 3500,
      estimatedDays: 2,
      serviceable: cart.pincode !== "999999",
      simulated: true,
      expiresAt,
    },
  ];
}
export function selectSimulatorRate(state: MerchantState, cart: Cart) {
  const rates = simulatorRates(state, cart);
  return rates.sort((a, b) =>
    state.rules.logisticsPreference === "fastest"
      ? a.estimatedDays - b.estimatedDays
      : a.cost - b.cost,
  )[0];
}
export function bookSimulatedShipment(state: MerchantState, id: string) {
  const order = state.orders.find((o) => o.id === id);
  assert(order, "Order not found", 404);
  assert(
    order.simulated,
    "Use the live logistics booking workflow for a real order",
    409,
  );
  assert(
    ["confirmed", "packed", "ready"].includes(order.status),
    "Order cannot be booked in this state",
    409,
  );
  if (!order.shipment)
    order.shipment = {
      id: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
      provider: order.quote.shippingQuote.provider,
      tracking: "",
      status: "Pickup requested (simulated)",
    };
  return order.shipment;
}
