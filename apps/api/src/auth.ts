import {
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { Database } from "./database";
const scrypt = promisify(callbackScrypt);
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${digest.toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createSession(db: Database, id: string, res: Response) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions (token,account_id,expires_at) VALUES ($1,$2,$3)",
    [tokenHash(token), id, new Date(Date.now() + 7 * 86400000)],
  );
  res.cookie("autobridge_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 86400000,
    path: "/",
  });
}
export async function sessionAccount(db: Database, req: Request) {
  const cookie: unknown = req.cookies?.autobridge_session;
  if (typeof cookie !== "string") return null;
  const { rows } = await db.query<{ account_id: string }>(
    "SELECT account_id FROM sessions WHERE token=$1 AND expires_at>NOW()",
    [tokenHash(cookie)],
  );
  return rows[0]?.account_id ?? null;
}
