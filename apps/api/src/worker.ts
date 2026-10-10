import { Database } from "./database";
import { processBuilds, recoverBuilds } from "./builds";
import { processProtocol } from "./protocol/queue";
import { expireReservations } from "../../../packages/core/src/commerce";
export function startWorker(db: Database) {
  let stopped = false,
    running: Promise<void> | null = null,
    ticks = 0;
  const tick = async () => {
    if (stopped || running) return;
    running = (async () => {
      await recoverBuilds(db);
      await processBuilds(db);
      if (
        process.env.PROTOCOL_MODE === "sandbox" &&
        process.env.NODE_ENV !== "production" &&
        process.env.ONDC_MERCHANT_ID &&
        process.env.ONDC_SIGNING_PRIVATE_KEY
      ) {
        await processProtocol(db, {
          identity: {
            id: process.env.ONDC_SUBSCRIBER_ID!,
            uri: process.env.ONDC_SUBSCRIBER_URL!,
            merchant: process.env.ONDC_MERCHANT_ID,
          },
          keyId: process.env.ONDC_KEY_ID!,
          privateKey: process.env.ONDC_SIGNING_PRIVATE_KEY.replaceAll(
            "\\n",
            "\n",
          ),
          callbackOrigins: process.env.ONDC_ALLOWED_CALLBACK_ORIGINS ?? "",
        });
      }
      if (ticks++ % 30 === 0) {
        const { rows } = await db.query<{ id: string }>(
          "SELECT id FROM merchants WHERE jsonb_path_exists(state, '$.orders[*] ? (@.status == \"reserved\")')",
        );
        for (const row of rows) await db.mutate(row.id, expireReservations);
        await db.query("DELETE FROM sessions WHERE expires_at<NOW()");
      }
    })()
      .catch((error) =>
        console.error(
          "Worker step failed:",
          error instanceof Error ? error.name : "unknown",
        ),
      )
      .finally(() => {
        running = null;
      });
    await running;
  };
  const timer = setInterval(() => void tick(), 2000);
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
