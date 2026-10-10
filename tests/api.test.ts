import { describe, it, expect, afterAll } from "vitest";
import { once } from "node:events";
import { Database } from "../apps/api/src/database";
import { createApplication, errorHandler } from "../apps/api/src/app";
import type { MerchantState } from "../packages/core/src/domain";
const db = await Database.open(undefined, true);
const app = await createApplication(db);
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("No test port");
const base = `http://127.0.0.1:${address.port}`;
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  method = "POST",
) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-autobridge-client": "portal",
      cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function register(email: string) {
  const result = await request("/auth/register", {
    email,
    password: "local-test-password-123",
  });
  expect(result.status).toBe(201);
  return result.headers.get("set-cookie")!.split(";")[0];
}
describe("seller API", () => {
  it("requires a session and protects mutation origins", async () => {
    expect((await request("/state", undefined, "", "GET")).status).toBe(401);
    expect(
      (
        await fetch(`${base}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  });
  it("supports login, inventory, an order and idempotent retries across authenticated requests", async () => {
    const cookie = await register("owner@example.test");
    expect((await request("/inventory/sample", {}, cookie)).status).toBe(200);
    const s = (await (
      await request("/state", undefined, cookie, "GET")
    ).json()) as { state: MerchantState };
    expect(s.state.products).toHaveLength(8);
    const cart = {
      items: [{ sku: s.state.products[0].sku, quantity: 2 }],
      pincode: "560001",
      customer: "Local Test",
      address: "Local test address",
      idempotencyKey: "integration-order-1",
    };
    const order = await (
      await request("/simulator/order", cart, cookie)
    ).json();
    expect(order.status).toBe("confirmed");
    expect(
      (await (await request("/simulator/order", cart, cookie)).json()).id,
    ).toBe(order.id);
    expect(
      (
        await request(
          `/orders/${order.id}/transition`,
          { status: "packed" },
          cookie,
        )
      ).status,
    ).toBe(200);
    const other = await register("other@example.test");
    expect(
      (
        await request(
          `/orders/${order.id}/transition`,
          { status: "packed" },
          other,
        )
      ).status,
    ).toBe(404);
    const login = await request("/auth/login", {
      email: "owner@example.test",
      password: "local-test-password-123",
    });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(
      (
        await request("/auth/login", {
          email: "owner@example.test",
          password: "wrong-password-123",
        })
      ).status,
    ).toBe(401);
    await request("/auth/logout", {}, cookie);
    expect((await request("/state", undefined, cookie, "GET")).status).toBe(
      401,
    );
  });
});
