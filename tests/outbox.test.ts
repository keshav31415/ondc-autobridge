import { describe, it, expect, afterAll } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Database } from "../apps/api/src/database";
import {
  enqueueProtocol,
  processProtocol,
} from "../apps/api/src/protocol/queue";
import { verifyAuthorization } from "../apps/api/src/protocol/security";
import type { ProtocolRequest } from "../apps/api/src/protocol/retail";
import { businessSchema } from "../packages/core/src/domain";
import { sampleProducts } from "../apps/api/src/spreadsheets";
const db = await Database.open(undefined, true);
afterAll(() => db.close());
describe("durable protocol outbox", () => {
  it("deduplicates ACKs, persists stock once, retries identical signed callbacks and limits attempts", async () => {
    const id = await db.createAccount("outbox@example.test", "unused");
    await db.mutate(id, (s) => {
      s.business = businessSchema.parse({
        name: "Test store",
        owner: "Owner test",
        phone: "9876543210",
        email: "x@example.test",
        address: "Test pickup address",
        city: "Delhi",
        pincode: "110001",
      });
      s.products = structuredClone(sampleProducts);
    });
    const request: ProtocolRequest = {
      context: {
        domain: "ONDC:RET10",
        country: "IND",
        city: "std:011",
        action: "init",
        core_version: "1.2.5",
        bap_id: "buyer.test",
        bap_uri: "https://buyer.test/api",
        transaction_id: randomUUID(),
        message_id: randomUUID(),
        timestamp: new Date().toISOString(),
        ttl: "PT30S",
      },
      message: {
        order: {
          items: [{ id: "TUR-200", quantity: { count: 1 } }],
          billing: { name: "Test buyer" },
          fulfillments: [
            {
              end: {
                location: {
                  address: { area_code: "560001", name: "Test delivery" },
                },
              },
            },
          ],
        },
      },
    };
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const bodies: string[] = [];
    let fail = true;
    const send: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://buyer.test/api/on_init");
      const raw = Buffer.from(init!.body as Buffer);
      bodies.push(raw.toString());
      verifyAuthorization(
        raw,
        (init!.headers as Record<string, string>).authorization,
        publicKey,
        "seller.test",
      );
      return Response.json({
        message: { ack: { status: fail ? "NACK" : "ACK" } },
      });
    };
    const config = {
      identity: { id: "seller.test", uri: "https://seller.test", merchant: id },
      keyId: "test-key",
      privateKey,
      callbackOrigins: "https://buyer.test",
      send,
    };
    expect((await enqueueProtocol(db, id, request)).message.ack.status).toBe(
      "ACK",
    );
    await enqueueProtocol(db, id, request);
    await expect(
      enqueueProtocol(db, id, { ...request, message: { order: {} } }),
    ).rejects.toThrow(/reused/);
    await processProtocol(db, config);
    expect((await db.read(id)).products[0].reserved).toBe(1);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM protocol_messages",
        )
      ).rows[0].status,
    ).toBe("callback");
    await db.query("UPDATE protocol_messages SET next_at=NOW()");
    fail = false;
    await processProtocol(db, config);
    expect(bodies[0]).toBe(bodies[1]);
    expect((await db.read(id)).orders).toHaveLength(1);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM protocol_messages",
        )
      ).rows[0].status,
    ).toBe("delivered");
    await db.query(
      "UPDATE protocol_messages SET next_at=NOW(),attempts=4,status='callback'",
    );
    fail = true;
    await processProtocol(db, config);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM protocol_messages",
        )
      ).rows[0].status,
    ).toBe("dead");
  });
});
