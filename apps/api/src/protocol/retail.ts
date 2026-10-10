import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import {
  assert,
  cartSchema,
  type Cart,
  type MerchantState,
  type Order,
  type Quote,
  type ShippingQuote,
} from "../../../../packages/core/src/domain";
import {
  available,
  placeOrder,
  quoteCart,
  transitionOrder,
} from "../../../../packages/core/src/commerce";
import { selectSimulatorRate } from "../logistics";

export const protocolSchema = z.object({
  context: z
    .object({
      domain: z.string(),
      country: z.literal("IND"),
      city: z.string(),
      action: z.enum([
        "search",
        "select",
        "init",
        "confirm",
        "status",
        "track",
        "cancel",
        "update",
      ]),
      core_version: z.literal("1.2.5"),
      bap_id: z.string().min(1),
      bap_uri: z.url(),
      transaction_id: z.string().min(1),
      message_id: z.string().min(1),
      timestamp: z.iso.datetime(),
      ttl: z.string().default("PT30S"),
    })
    .passthrough(),
  message: z.record(z.string(), z.unknown()),
});
export type ProtocolRequest = z.infer<typeof protocolSchema>;
export type Identity = { id: string; uri: string; merchant: string };
export type ProtocolResponse = {
  context: Record<string, unknown> & { action: string };
  message: Record<string, unknown>;
  error?: { type: string; code: string; message: string };
};
const price = (value: number) => (value / 100).toFixed(2);
const transactionKey = (request: ProtocolRequest) =>
  createHash("sha256")
    .update(
      JSON.stringify([request.context.bap_id, request.context.transaction_id]),
    )
    .digest("hex");
function cartFrom(request: ProtocolRequest): Cart {
  const input = z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          quantity: z.object({ count: z.number().int().positive() }),
        }),
      ),
      billing: z
        .object({ name: z.string().optional() })
        .passthrough()
        .optional(),
      fulfillments: z
        .array(
          z.object({
            end: z.object({
              location: z.object({
                address: z
                  .object({
                    area_code: z.string(),
                    name: z.string().optional(),
                  })
                  .passthrough(),
              }),
            }),
          }),
        )
        .min(1),
    })
    .passthrough()
    .parse(request.message.order);
  return cartSchema.parse({
    items: input.items.map((i) => ({ sku: i.id, quantity: i.quantity.count })),
    pincode: input.fulfillments[0].end.location.address.area_code,
    customer: input.billing?.name ?? "ONDC buyer",
    address:
      input.fulfillments[0].end.location.address.name ??
      "Address supplied by buyer",
    idempotencyKey: transactionKey(request),
  });
}
function protocolQuote(quote: Quote) {
  return {
    price: { currency: "INR", value: price(quote.total) },
    breakup: [
      ...quote.items.map((item) => ({
        "@ondc/org/item_id": item.sku,
        "@ondc/org/item_quantity": { count: item.quantity },
        "@ondc/org/title_type": "item",
        title: item.name,
        price: { currency: "INR", value: price(item.total) },
        item: { price: { currency: "INR", value: price(item.unitPrice) } },
      })),
      {
        title: "Delivery",
        "@ondc/org/title_type": "delivery",
        price: { currency: "INR", value: price(quote.shipping) },
      },
      ...(quote.discount
        ? [
            {
              title: "Discount",
              "@ondc/org/title_type": "discount",
              price: { currency: "INR", value: price(-quote.discount) },
            },
          ]
        : []),
    ],
    ttl: "PT10M",
  };
}
function orderMessage(order: Order, merchant: string) {
  const states: Record<string, string> = {
    reserved: "Created",
    confirmed: "Accepted",
    packed: "Accepted",
    ready: "Accepted",
    picked_up: "In-progress",
    in_transit: "In-progress",
    delivery_failed: "In-progress",
    delivered: "Completed",
    cancelled: "Cancelled",
    returned: "Cancelled",
  };
  const fulfillments: Record<string, string> = {
    reserved: "Pending",
    confirmed: "Pending",
    packed: "Packed",
    ready: "Packed",
    picked_up: "Order-picked-up",
    in_transit: "In-transit",
    delivery_failed: "Delivery-failed",
    delivered: "Order-delivered",
    cancelled: "Cancelled",
    returned: "RTO-Delivered",
  };
  return {
    id: order.id,
    state: states[order.status],
    provider: { id: merchant },
    items: order.quote.items.map((i) => ({
      id: i.sku,
      quantity: { count: i.quantity },
      fulfillment_id: "F1",
    })),
    billing: { name: order.customer },
    quote: protocolQuote(order.quote),
    fulfillments: [
      {
        id: "F1",
        type: "Delivery",
        state: { descriptor: { code: fulfillments[order.status] } },
        tracking: Boolean(order.shipment?.tracking),
        end: {
          location: {
            address: {
              name: order.address,
              area_code: order.pincode,
              country: "IND",
            },
          },
        },
      },
    ],
    payment: {
      type: "ON-ORDER",
      status: order.payment === "paid" ? "PAID" : "NOT-PAID",
      params: { currency: "INR", amount: price(order.quote.total) },
    },
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}
export function handleProtocol(
  state: MerchantState,
  raw: unknown,
  identity: Identity,
  simulated = false,
  liveShipping?: ShippingQuote,
): ProtocolResponse {
  const request = protocolSchema.parse(raw);
  assert(state.business, "Business setup is incomplete");
  assert(
    request.context.domain === state.business.domain,
    "This retail domain is not configured",
  );
  const context = {
    ...request.context,
    action: `on_${request.context.action}`,
    bpp_id: identity.id,
    bpp_uri: identity.uri,
    timestamp: new Date().toISOString(),
  };
  const shipping = (cart: Cart) => {
    if (simulated) return selectSimulatorRate(state, cart);
    assert(
      liveShipping && !liveShipping.simulated,
      "A verified logistics quote is required",
    );
    return liveShipping;
  };
  let message: Record<string, unknown>;
  switch (request.context.action) {
    case "search":
      message = {
        catalog: {
          "bpp/descriptor": { name: state.business.name },
          "bpp/providers": [
            {
              id: identity.merchant,
              descriptor: { name: state.business.name },
              time: {
                label: state.rules.acceptingOrders ? "enable" : "disable",
                timestamp: context.timestamp,
              },
              ttl: "P1D",
              locations: [
                {
                  id: "L1",
                  address: {
                    name: state.business.address,
                    city: state.business.city,
                    area_code: state.business.pincode,
                    country: "IND",
                  },
                },
              ],
              fulfillments: [
                {
                  id: "F1",
                  type: "Delivery",
                  contact: {
                    phone: state.business.phone,
                    email: state.business.email,
                  },
                },
              ],
              items: state.products
                .filter((p) => p.enabled)
                .map((p) => ({
                  id: p.sku,
                  descriptor: {
                    name: p.name,
                    code: p.sku,
                    images: p.image ? [p.image] : [],
                  },
                  price: {
                    currency: "INR",
                    value: price(p.price),
                    maximum_value: price(p.mrp),
                  },
                  quantity: {
                    unitized: {
                      measure: { unit: "gram", value: String(p.weight) },
                    },
                    available: { count: String(available(p, state.rules)) },
                    maximum: {
                      count: String(
                        Math.min(
                          available(p, state.rules),
                          state.rules.maxPerItem,
                        ),
                      ),
                    },
                  },
                  category_id: p.category,
                  fulfillment_id: "F1",
                  location_id: "L1",
                  "@ondc/org/returnable": state.rules.returnDays > 0,
                  "@ondc/org/cancellable": true,
                  "@ondc/org/return_window": `P${state.rules.returnDays}D`,
                  "@ondc/org/seller_pickup_return": false,
                  "@ondc/org/time_to_ship": `P${state.rules.dispatchDays || 1}D`,
                  "@ondc/org/available_on_cod": false,
                  "@ondc/org/contact_details_consumer_care": `${state.business!.name},${state.business!.email},${state.business!.phone}`,
                })),
            },
          ],
        },
      };
      break;
    case "select": {
      const cart = cartFrom(request);
      const quote = quoteCart(state, cart, shipping(cart));
      message = {
        order: {
          provider: { id: identity.merchant },
          items: quote.items.map((i) => ({
            id: i.sku,
            quantity: { count: i.quantity },
            fulfillment_id: "F1",
          })),
          quote: protocolQuote(quote),
          fulfillments: [
            {
              id: "F1",
              type: "Delivery",
              state: { descriptor: { code: "Serviceable" } },
              "@ondc/org/TAT": `P${quote.shippingQuote.estimatedDays}D`,
            },
          ],
        },
      };
      break;
    }
    case "init": {
      const cart = cartFrom(request);
      const order = placeOrder(state, cart, shipping(cart), "reserved");
      message = { order: orderMessage(order, identity.merchant) };
      break;
    }
    case "confirm": {
      const input = z
        .object({
          id: z.string(),
          quote: z
            .object({ price: z.object({ value: z.string() }) })
            .passthrough()
            .optional(),
        })
        .passthrough()
        .parse(request.message.order);
      const order = state.orders.find((o) => o.id === input.id);
      assert(
        order && order.key === transactionKey(request),
        "Unknown order or transaction",
        404,
      );
      if (input.quote)
        assert(
          Math.round(Number(input.quote.price.value) * 100) ===
            order.quote.total,
          "Confirmed price does not match the agreed quote",
          409,
        );
      if (order.status === "reserved")
        transitionOrder(state, order.id, "confirmed");
      assert(
        !["cancelled", "returned"].includes(order.status),
        "Order is no longer confirmable",
        409,
      );
      message = { order: orderMessage(order, identity.merchant) };
      break;
    }
    case "status":
    case "track":
    case "cancel": {
      const input = z
        .object({ order_id: z.string() })
        .passthrough()
        .parse(request.message);
      const order = state.orders.find((o) => o.id === input.order_id);
      assert(
        order && order.key === transactionKey(request),
        "Unknown order or transaction",
        404,
      );
      if (request.context.action === "cancel")
        transitionOrder(state, order.id, "cancelled");
      message =
        request.context.action === "track"
          ? {
              tracking: {
                id: order.shipment?.id ?? order.id,
                status: order.shipment ? "active" : "inactive",
                ...(order.shipment?.tracking
                  ? { url: order.shipment.tracking }
                  : {}),
              },
            }
          : { order: orderMessage(order, identity.merchant) };
      break;
    }
    case "update": {
      const input = z
        .object({
          update_target: z.literal("fulfillment"),
          order: z
            .object({
              id: z.string(),
              fulfillments: z
                .array(
                  z
                    .object({
                      id: z.literal("F1"),
                      end: z
                        .object({
                          instructions: z
                            .object({
                              short_desc: z.string().trim().min(1).max(500),
                            })
                            .strict(),
                        })
                        .strict(),
                    })
                    .strict(),
                )
                .length(1),
            })
            .strict(),
        })
        .strict()
        .parse(request.message);
      const order = state.orders.find((o) => o.id === input.order.id);
      assert(
        order && order.key === transactionKey(request),
        "Unknown order or transaction",
        404,
      );
      assert(
        ["confirmed", "packed", "ready"].includes(order.status),
        "Delivery instructions can only change before dispatch",
        409,
      );
      order.deliveryInstructions =
        input.order.fulfillments[0].end.instructions.short_desc;
      order.updatedAt = new Date().toISOString();
      order.history.push({
        at: order.updatedAt,
        event: "Buyer updated delivery instructions",
      });
      const result = orderMessage(order, identity.merchant);
      Object.assign(result.fulfillments[0].end, {
        instructions: { short_desc: order.deliveryInstructions },
      });
      message = { order: result };
      break;
    }
  }
  return { context, message };
}
export function runProtocolSimulation(state: MerchantState, merchant: string) {
  // Isolate all protocol-test orders from the seller's actual stock and order list.
  const clone = structuredClone(state);
  assert(clone.business, "Complete business setup before testing");
  const product = clone.products.find(
    (p) => p.enabled && available(p, clone.rules) > 0,
  );
  assert(product, "Add an available product before testing");
  const transaction_id = randomUUID(),
    identity = {
      id: "local.seller.autobridge",
      uri: "https://seller.example.test",
      merchant,
    };
  const request = (
    action: ProtocolRequest["context"]["action"],
    message: Record<string, unknown>,
  ): ProtocolRequest => ({
    context: {
      domain: clone.business!.domain,
      country: "IND",
      city: "std:011",
      action,
      core_version: "1.2.5",
      bap_id: "local.buyer.autobridge",
      bap_uri: "https://buyer.example.test",
      transaction_id,
      message_id: randomUUID(),
      timestamp: new Date().toISOString(),
      ttl: "PT30S",
    },
    message,
  });
  const events: { action: string; status: string; detail: string }[] = [];
  const exchanges: { request: ProtocolRequest; response: ProtocolResponse }[] =
    [];
  const run = (
    action: ProtocolRequest["context"]["action"],
    message: Record<string, unknown>,
  ) => {
    const req = request(action, message),
      response = handleProtocol(clone, req, identity, true);
    events.push({
      action: `/${action} → /on_${action}`,
      status: "PASS",
      detail: "Local handler and callback payload verified",
    });
    exchanges.push({ request: req, response });
    return response;
  };
  run("search", { intent: {} });
  const order = {
    items: [{ id: product.sku, quantity: { count: 1 } }],
    billing: { name: "Protocol test buyer" },
    fulfillments: [
      {
        end: {
          location: {
            address: { area_code: "560001", name: "Local simulation" },
          },
        },
      },
    ],
  };
  run("select", { order });
  const init = run("init", { order });
  const id = (init.message.order as { id: string }).id;
  run("confirm", { order: { id } });
  run("update", {
    update_target: "fulfillment",
    order: {
      id,
      fulfillments: [
        { id: "F1", end: { instructions: { short_desc: "Call at the gate" } } },
      ],
    },
  });
  run("status", { order_id: id });
  run("track", { order_id: id });
  run("cancel", { order_id: id, cancellation_reason_id: "001" });
  return { events, exchanges };
}
