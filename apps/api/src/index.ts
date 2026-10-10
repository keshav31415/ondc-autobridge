import "dotenv/config";
import { Database } from "./database";
import { createApplication, errorHandler } from "./app";
import { startWorker } from "./worker";
const db = await Database.open();
const app = await createApplication(db);
const stopWorker =
  process.env.INLINE_WORKER === "false" ? async () => {} : startWorker(db);
app.use(errorHandler);
const port = Number(process.env.PORT ?? 4100);
const server = app.listen(
  port,
  process.env.API_HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () => {
    const address = server.address();
    console.log(
      `AutoBridge API: http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`,
    );
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void stopWorker()
        .then(() => db.close())
        .then(() => process.exit(0));
    });
  });
