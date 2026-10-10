import {
  createHash,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { assert } from "../../../../packages/core/src/domain";
export function stableJson(value: unknown): string {
  const sort = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sort)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)]),
          )
        : item;
  return JSON.stringify(sort(value));
}
export function signingText(body: Buffer, created: number, expires: number) {
  return `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${createHash("blake2b512").update(body).digest("base64")}`;
}
export function signAuthorization(
  body: Buffer,
  privateKey: string | KeyObject,
  subscriber: string,
  keyId: string,
  created = Math.floor(Date.now() / 1000),
) {
  const expires = created + 300;
  const signature = sign(
    null,
    Buffer.from(signingText(body, created, expires)),
    privateKey,
  ).toString("base64");
  return `Signature keyId="${subscriber}|${keyId}|ed25519",algorithm="ed25519",created="${created}",expires="${expires}",headers="(created) (expires) digest",signature="${signature}"`;
}
export function headerFields(header: string) {
  return Object.fromEntries(
    [...header.matchAll(/([a-zA-Z]+)="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
}
export function verifyAuthorization(
  body: Buffer,
  header: string,
  publicKey: string | KeyObject,
  expectedSubscriber: string,
  now = Math.floor(Date.now() / 1000),
) {
  const fields = headerFields(header);
  const [subscriber, keyId, keyAlgorithm] = fields.keyId?.split("|") ?? [];
  const created = Number(fields.created),
    expires = Number(fields.expires);
  assert(
    header.startsWith("Signature ") &&
      subscriber === expectedSubscriber &&
      keyId &&
      keyAlgorithm === "ed25519",
    "Invalid signing identity",
    401,
  );
  assert(
    fields.algorithm === "ed25519" &&
      fields.headers === "(created) (expires) digest",
    "Unsupported signature format",
    401,
  );
  assert(
    Number.isInteger(created) &&
      Number.isInteger(expires) &&
      created <= now + 30 &&
      expires > now &&
      expires > created &&
      expires - created <= 300,
    "Signature expired or outside the allowed time window",
    401,
  );
  assert(
    Boolean(fields.signature) &&
      verify(
        null,
        Buffer.from(signingText(body, created, expires)),
        publicKey,
        Buffer.from(fields.signature, "base64"),
      ),
    "Signature verification failed",
    401,
  );
  return true;
}
export function registryPublicKey(raw: string) {
  if (raw.includes("BEGIN PUBLIC KEY")) return createPublicKey(raw);
  const bytes = Buffer.from(raw, "base64");
  assert(bytes.length === 32, "Invalid registry public key", 401);
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), bytes]),
    format: "der",
    type: "spki",
  });
}
export function allowedCallback(value: string, origins: string) {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error("Invalid callback URL");
  }
  const allowed = origins
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  assert(
    uri.protocol === "https:" &&
      !uri.username &&
      !uri.password &&
      !uri.hash &&
      !uri.search &&
      allowed.includes(uri.origin),
    "Callback origin is not approved",
    403,
  );
  return uri.href.replace(/\/$/, "");
}
