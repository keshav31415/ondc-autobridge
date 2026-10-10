import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Database } from "../apps/api/src/database";
import { configurationSchema } from "../apps/api/src/builds";
import { passwordHash } from "../apps/api/src/auth";
import { assert } from "../packages/core/src/domain";
import { z } from "zod";
const db = await Database.open();
try {
  const { rows } = await db.query("SELECT id FROM accounts LIMIT 1");
  if (!rows.length) {
    const input = configurationSchema.parse(
      JSON.parse(await readFile("merchant.json", "utf8")),
    );
    const email = z.email().parse(process.env.BOOTSTRAP_EMAIL);
    const password = process.env.BOOTSTRAP_PASSWORD ?? "";
    assert(
      password.length >= 12,
      "Set BOOTSTRAP_PASSWORD to at least 12 characters",
    );
    const id = await db.createAccount(
      email.toLowerCase(),
      await passwordHash(password),
    );
    await db.mutate(id, (state) => {
      Object.assign(state, input);
      state.onboarded = true;
      state.onboardingStep = 6;
    });
    console.log(`Created seller account ${id}`);
  }
} finally {
  await db.close();
}
await import("../apps/api/src/index");
