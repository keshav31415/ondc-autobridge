import "dotenv/config";
import { Database } from "./database";
import { createApplication, errorHandler } from "./app";
const db = await Database.open();
const app = await createApplication(db);
app.use(errorHandler);
const port = Number(process.env.PORT ?? 4100);
const server = app.listen(
  port,
  process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  () => console.log(`AutoBridge API: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
