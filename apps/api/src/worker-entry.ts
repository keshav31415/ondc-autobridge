import "dotenv/config";
import { Database } from "./database";
import { startWorker } from "./worker";
if (!process.env.DATABASE_URL)
  throw new Error(
    "A separate worker requires PostgreSQL. Local PGlite uses the API inline worker.",
  );
const db = await Database.open();
const stop = startWorker(db);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(
    signal,
    () =>
      void stop()
        .then(() => db.close())
        .then(() => process.exit(0)),
  );
