import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Express, Request } from "express";
import { Database } from "../database";
import {
  assert,
  DomainError,
  type MerchantState,
} from "../../../../packages/core/src/domain";
import { expireReservations } from "../../../../packages/core/src/commerce";
import {
  handleProtocol,
  protocolSchema,
  runProtocolSimulation,
  type Identity,
  type ProtocolRequest,
  type ProtocolResponse,
} from "./retail";
import {
  allowedCallback,
  headerFields,
  registryPublicKey,
  signAuthorization,
  verifyAuthorization,
  stableJson,
} from "./security";

export type TransportConfig = {
  identity: Identity;
  keyId: string;
  privateKey: string | KeyObject;
  callbackOrigins: string;
  send?: typeof fetch;
};
type Message = {
  id: string;
  merchant_id: string;
  request: ProtocolRequest;
  response: ProtocolResponse | null;
  status: string;
  attempts: number;
};
export async function enqueueProtocol(
  db: Database,
  merchant: string,
  request: ProtocolRequest,
) {
  const id = createHash("sha256")
    .update(
      JSON.stringify([
        merchant,
        request.context.bap_id,
        request.context.transaction_id,
        request.context.message_id,
      ]),
    )
    .digest("hex");
  await db.transaction(async (q) => {
    await q.query(
      "INSERT INTO protocol_messages (id,merchant_id,sender,action,request) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (id) DO NOTHING",
      [
        id,
        merchant,
        request.context.bap_id,
        request.context.action,
        JSON.stringify(request),
      ],
    );
    const { rows } = await q.query<{ same: boolean }>(
      "SELECT request=$2::jsonb AS same FROM protocol_messages WHERE id=$1",
      [id, JSON.stringify(request)],
    );
    assert(
      rows[0]?.same,
      "Message ID was reused with a different payload",
      409,
    );
  });
  return { message: { ack: { status: "ACK" } } };
}

// A committed response and the corresponding inventory change are atomic. Callback
// delivery is at-least-once; message_id lets the buyer deduplicate a retried callback.
export async function processProtocol(db: Database, config: TransportConfig) {
  const { rows: candidates } = await db.query<Message>(
    "SELECT * FROM protocol_messages WHERE merchant_id=$1 AND status IN ('pending','callback','sending') AND next_at<=NOW() ORDER BY created_at LIMIT 10",
    [config.identity.merchant],
  );
  for (const candidate of candidates) {
    const claimed = await db.mutate(candidate.merchant_id, async (state, q) => {
      const { rows } = await q.query<Message>(
        "SELECT * FROM protocol_messages WHERE id=$1 AND next_at<=NOW() AND status IN ('pending','callback','sending') FOR UPDATE",
        [candidate.id],
      );
      const row = rows[0];
      if (!row) return null;
      let response = row.response;
      if (!response) {
        expireReservations(state);
        const next = structuredClone(state);
        try {
          response = handleProtocol(next, row.request, config.identity, true);
          Object.assign(state, next);
        } catch (error) {
          response = {
            context: {
              ...row.request.context,
              action: `on_${row.request.context.action}`,
              bpp_id: config.identity.id,
              bpp_uri: config.identity.uri,
              timestamp: new Date().toISOString(),
            },
            message: {},
            error: {
              type: "DOMAIN-ERROR",
              code: "30000",
              message:
                error instanceof DomainError || error instanceof z.ZodError
                  ? error.message
                  : "Unsupported local protocol request",
            },
          };
        }
      }
      await q.query(
        "UPDATE protocol_messages SET response=$2::jsonb,status='sending',attempts=attempts+1,next_at=NOW()+INTERVAL '30 seconds' WHERE id=$1",
        [row.id, JSON.stringify(response)],
      );
      return { ...row, response, attempts: row.attempts + 1 };
    });
    if (!claimed) continue;
    try {
      const destination = allowedCallback(
        claimed.request.context.bap_uri,
        config.callbackOrigins,
      );
      const body = Buffer.from(stableJson(claimed.response));
      const result = await (config.send ?? fetch)(
        `${destination}/${claimed.response.context.action}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: signAuthorization(
              body,
              config.privateKey,
              config.identity.id,
              config.keyId,
            ),
          },
          body,
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        },
      );
      assert(result.ok, "Callback transport failed");
      const ack = (await result.json()) as {
        message?: { ack?: { status?: string } };
      };
      assert(
        ack.message?.ack?.status === "ACK",
        "Buyer did not acknowledge callback",
      );
      await db.query(
        "UPDATE protocol_messages SET status='delivered',error=NULL WHERE id=$1",
        [claimed.id],
      );
    } catch {
      await db.query(
        "UPDATE protocol_messages SET status=$2,error=$3,next_at=$4 WHERE id=$1",
        [
          claimed.id,
          claimed.attempts >= 5 ? "dead" : "callback",
          "Callback delivery failed; inspect receiver connectivity and ACK",
          new Date(
            Date.now() + Math.min(300000, 1000 * 2 ** claimed.attempts),
          ).toISOString(),
        ],
      );
    }
  }
}

export function attachProtocolRoutes(app: Express, db: Database) {
  app.post("/protocol/:merchant/:action", async (req: Request, res) => {
    // This build implements a local protocol profile. It deliberately cannot be
    // promoted to the public network by flipping a flag before conformance work.
    assert(
      process.env.PROTOCOL_MODE === "sandbox" &&
        process.env.NODE_ENV !== "production",
      "Network endpoint disabled. Use the portal protocol simulator.",
      503,
    );
    const merchant = String(req.params.merchant);
    assert(
      merchant === process.env.ONDC_MERCHANT_ID,
      "Seller identity is not configured",
      404,
    );
    const request = protocolSchema.parse(req.body);
    assert(
      request.context.action === req.params.action,
      "Action does not match endpoint",
    );
    const timestamp = Date.parse(request.context.timestamp),
      ttl = /^PT(\d+)S$/.exec(request.context.ttl);
    assert(
      ttl &&
        Number(ttl[1]) >= 1 &&
        Number(ttl[1]) <= 300 &&
        timestamp <= Date.now() + 30000 &&
        timestamp + Number(ttl[1]) * 1000 > Date.now(),
      "Message TTL has expired",
      400,
    );
    allowedCallback(
      request.context.bap_uri,
      process.env.ONDC_ALLOWED_CALLBACK_ORIGINS ?? "",
    );
    const trusted = z
      .array(
        z.object({
          subscriber: z.string(),
          keyId: z.string(),
          publicKey: z.string(),
          uri: z.url(),
        }),
      )
      .parse(
        JSON.parse(
          await readFile(process.env.ONDC_TRUSTED_KEYS_FILE ?? "", "utf8"),
        ),
      );
    const header = req.get("authorization") ?? "",
      fields = headerFields(header);
    const peer = trusted.find(
      (p) =>
        p.subscriber === request.context.bap_id &&
        fields.keyId === `${p.subscriber}|${p.keyId}|ed25519` &&
        p.uri === request.context.bap_uri,
    );
    assert(peer, "Buyer is not registered in the sandbox trust store", 401);
    verifyAuthorization(
      (req as Request & { rawBody: Buffer }).rawBody,
      header,
      registryPublicKey(peer.publicKey),
      peer.subscriber,
    );
    await db.read(merchant);
    res.json(await enqueueProtocol(db, merchant, request));
  });
  app.post("/api/protocol/simulate", async (_req, res) => {
    const state = await db.read(String(res.locals.accountId));
    const result = runProtocolSimulation(state, String(res.locals.accountId));
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    for (const exchange of result.exchanges) {
      const raw = Buffer.from(JSON.stringify(exchange.response));
      verifyAuthorization(
        raw,
        signAuthorization(
          raw,
          privateKey,
          "local.seller.autobridge",
          "local-key",
        ),
        publicKey,
        "local.seller.autobridge",
      );
    }
    result.events.push({
      action: "Ed25519 / BLAKE-512",
      status: "PASS",
      detail:
        "All local callbacks signed and verified using an ephemeral key pair",
    });
    res.json({
      ...result,
      scope:
        "Local protocol profile only; not an ONDC conformance certification",
    });
  });
  app.get("/api/protocol/messages", async (_req, res) => {
    const { rows } = await db.query(
      "SELECT id,action,status,attempts,error,created_at FROM protocol_messages WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100",
      [String(res.locals.accountId)],
    );
    res.json(rows);
  });
  app.post("/api/protocol/messages/:id/retry", async (req, res) => {
    const { rows } = await db.query(
      "UPDATE protocol_messages SET status='callback',attempts=0,next_at=NOW(),error=NULL WHERE id=$1 AND merchant_id=$2 AND status='dead' RETURNING id",
      [String(req.params.id), String(res.locals.accountId)],
    );
    assert(rows.length, "No failed callback found", 404);
    res.json({ ok: true });
  });
}
