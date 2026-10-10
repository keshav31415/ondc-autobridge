import { describe, it, expect } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  signAuthorization,
  verifyAuthorization,
  allowedCallback,
} from "../apps/api/src/protocol/security";
import { handleProtocol } from "../apps/api/src/protocol/retail";
import { initialState, businessSchema } from "../packages/core/src/domain";
import { sampleProducts } from "../apps/api/src/spreadsheets";
describe("protocol security", () => {
  it("signs the exact bytes and rejects changed bytes, expiry and the wrong sender", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const raw = Buffer.from('{"message": {"x":1}}');
    const header = signAuthorization(raw, privateKey, "buyer.test", "key-1");
    expect(verifyAuthorization(raw, header, publicKey, "buyer.test")).toBe(
      true,
    );
    expect(() =>
      verifyAuthorization(Buffer.from("{}"), header, publicKey, "buyer.test"),
    ).toThrow();
    expect(() =>
      verifyAuthorization(raw, header, publicKey, "other.test"),
    ).toThrow();
    expect(() =>
      verifyAuthorization(
        raw,
        signAuthorization(raw, privateKey, "buyer.test", "key-1", 100),
        publicKey,
        "buyer.test",
      ),
    ).toThrow();
  });
  it("only allows explicitly registered HTTPS callback origins", () => {
    expect(
      allowedCallback("https://buyer.example/api", "https://buyer.example"),
    ).toBe("https://buyer.example/api");
    for (const url of [
      "http://buyer.example",
      "https://buyer.example.attacker.test",
      "https://user:pass@buyer.example",
      "https://127.0.0.1",
    ])
      expect(() => allowedCallback(url, "https://buyer.example")).toThrow();
  });
});
describe("local retail protocol", () => {
  it("runs search, selection, init, confirm, status, track and cancellation with callbacks", () => {
    const state = initialState();
    state.products = structuredClone(sampleProducts);
    state.business = businessSchema.parse({
      name: "Test Store",
      owner: "Test Owner",
      phone: "9876543210",
      email: "test@example.test",
      address: "Test pickup address",
      city: "Delhi",
      pincode: "110001",
    });
    const transaction_id = randomUUID();
    const identity = {
      id: "seller.test",
      uri: "https://seller.test",
      merchant: "provider-1",
    };
    const request = (action: string, message: unknown) => ({
      context: {
        domain: "ONDC:RET10",
        country: "IND",
        city: "std:011",
        action,
        core_version: "1.2.5",
        bap_id: "buyer.test",
        bap_uri: "https://buyer.test",
        transaction_id,
        message_id: randomUUID(),
        timestamp: new Date().toISOString(),
        ttl: "PT30S",
      },
      message,
    });
    expect(
      handleProtocol(state, request("search", { intent: {} }), identity, true)
        .context.action,
    ).toBe("on_search");
    const order = {
      items: [{ id: "TUR-200", quantity: { count: 1 } }],
      billing: { name: "Test Buyer" },
      fulfillments: [
        {
          end: {
            location: { address: { area_code: "560001", name: "Test street" } },
          },
        },
      ],
    };
    expect(
      handleProtocol(state, request("select", { order }), identity, true)
        .context.action,
    ).toBe("on_select");
    const init = handleProtocol(
      state,
      request("init", { order }),
      identity,
      true,
    );
    const id = (init.message as { order: { id: string } }).order.id;
    expect(state.products[0].reserved).toBe(1);
    handleProtocol(
      state,
      request("confirm", { order: { id } }),
      identity,
      true,
    );
    expect(state.orders[0].status).toBe("confirmed");
    for (const action of ["status", "track"])
      expect(
        handleProtocol(state, request(action, { order_id: id }), identity, true)
          .context.action,
      ).toBe(`on_${action}`);
    handleProtocol(
      state,
      request("cancel", { order_id: id, cancellation_reason_id: "001" }),
      identity,
      true,
    );
    expect(state.products[0].reserved).toBe(0);
  });
});
