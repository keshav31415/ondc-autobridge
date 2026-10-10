import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  businessSchema,
  rulesSchema,
  cartSchema,
  productSchema,
  assert,
  record,
  DomainError,
  type OrderStatus,
} from "../../../packages/core/src/domain";
import {
  available,
  changeRules,
  importProducts,
  placeOrder,
  quoteCart,
  transitionOrder,
  expireReservations,
} from "../../../packages/core/src/commerce";
import { Database } from "./database";
import {
  createSession,
  passwordHash,
  passwordMatches,
  sessionAccount,
  tokenHash,
} from "./auth";
import {
  readSpreadsheet,
  mapRows,
  createSpreadsheet,
  sampleProducts,
  importFields,
  type Mapping,
} from "./spreadsheets";
import { bookSimulatedShipment, selectSimulatorRate } from "./logistics";
import { attachProtocolRoutes } from "./protocol/queue";
import { attachBuildRoutes } from "./builds";

const credentials = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(12, "Use at least 12 characters").max(128),
});
export async function createApplication(db: Database) {
  const app = express();
  app.disable("x-powered-by");
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (proxyHops > 0 && proxyHops <= 2) app.set("trust proxy", proxyHops);
  app.use(helmet());
  const origins = (process.env.WEB_ORIGIN ?? "http://127.0.0.1:3100").split(
    ",",
  );
  app.use(cors({ origin: origins, credentials: true }));
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buffer;
      },
    }),
  );
  app.use(cookieParser());
  app.get("/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok", service: "autobridge-api" });
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        req.get("x-autobridge-client") !== "portal" ||
        (req.get("origin") && !origins.includes(req.get("origin")!))
      )
        return res.status(403).json({ error: "Request origin is not allowed" });
    }
    next();
  });
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many attempts. Please try again later." },
    }),
  );
  app.post("/api/auth/register", async (req, res) => {
    const input = credentials.parse(req.body);
    let id: string;
    try {
      id = await db.createAccount(
        input.email,
        await passwordHash(input.password),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new DomainError("An account with this email already exists", 409);
      throw error;
    }
    await createSession(db, id, res);
    res.status(201).json({ id, state: await db.read(id) });
  });
  app.post("/api/auth/login", async (req, res) => {
    const input = credentials.parse(req.body);
    const { rows } = await db.query<{ id: string; password: string }>(
      "SELECT id,password FROM accounts WHERE email=$1",
      [input.email],
    );
    if (!rows[0] || !(await passwordMatches(input.password, rows[0].password)))
      throw new DomainError("Email or password is incorrect", 401);
    await createSession(db, rows[0].id, res);
    res.json({ id: rows[0].id, state: await db.read(rows[0].id) });
  });
  app.post("/api/auth/demo", async (_req, res) => {
    assert(
      process.env.NODE_ENV !== "production",
      "Demo accounts are disabled in production",
      403,
    );
    const id = await db.createAccount(
      `demo-${randomUUID()}@autobridge.test`,
      await passwordHash(randomUUID()),
      true,
    );
    await db.mutate(id, (state) => {
      state.business = businessSchema.parse({
        name: "Aaranya Pantry",
        owner: "Ananya Sharma",
        phone: "9876543210",
        email: "hello@example.test",
        address: "24, Green Park Extension",
        city: "New Delhi",
        pincode: "110016",
        participation: "undecided",
      });
      importProducts(state, sampleProducts, 0);
      state.onboarded = true;
      state.onboardingStep = 6;
      ["Meera Joshi", "Rahul Verma", "Diya Patel", "Arjun Rao"].forEach(
        (customer, index) => {
          const cart = cartSchema.parse({
            items: [
              { sku: sampleProducts[index].sku, quantity: index === 0 ? 2 : 1 },
            ],
            pincode: ["560001", "400001", "110001", "600001"][index],
            customer,
            address: "Demo address — no real shipment",
            idempotencyKey: `demo-order-${index}`,
          });
          const order = placeOrder(
            state,
            cart,
            selectSimulatorRate(state, cart),
          );
          if (index > 0) {
            transitionOrder(state, order.id, "packed");
            bookSimulatedShipment(state, order.id);
          }
          if (index > 1) transitionOrder(state, order.id, "ready");
          if (index > 2) {
            transitionOrder(state, order.id, "picked_up");
            transitionOrder(state, order.id, "in_transit");
            transitionOrder(state, order.id, "delivered");
          }
        },
      );
    });
    await createSession(db, id, res);
    res.json({ id, state: await db.read(id) });
  });
  app.use("/api", async (req, res, next) => {
    const id = await sessionAccount(db, req);
    if (!id) return res.status(401).json({ error: "Please sign in" });
    res.locals.accountId = id;
    next();
  });
  const account = (res: Response) => String(res.locals.accountId);
  app.get("/api/state", async (_req, res) => {
    const id = account(res);
    await db.mutate(id, (s) => expireReservations(s));
    res.json({
      id,
      state: await db.read(id),
      integrations: {
        cline:
          process.env.CLINE_ENABLED === "true" &&
          Boolean(process.env.CLINE_API_KEY),
        logistics: "simulator",
        ondc: "not_activated",
        environment:
          process.env.NODE_ENV === "production" ? "production" : "local",
      },
    });
  });
  app.post("/api/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE token=$1", [
      tokenHash(String(req.cookies.autobridge_session)),
    ]);
    res.clearCookie("autobridge_session", { path: "/" });
    res.json({ ok: true });
  });
  app.put("/api/business", async (req, res) => {
    const business = businessSchema.parse(req.body);
    await db.mutate(account(res), (s) => {
      s.business = business;
      s.onboardingStep = Math.max(1, s.onboardingStep);
      record(s, "business.updated", business.name);
    });
    res.json({ ok: true });
  });
  app.put("/api/rules", async (req, res) => {
    const input = z
      .object({ rules: rulesSchema, version: z.number().int() })
      .parse(req.body);
    await db.mutate(account(res), (s) => {
      changeRules(s, input.rules, input.version);
      s.onboardingStep = Math.max(4, s.onboardingStep);
    });
    res.json({ ok: true });
  });
  app.get("/api/inventory/template", async (_req, res) => {
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("autobridge-inventory-template.xlsx")
      .send(await createSpreadsheet());
  });
  app.get("/api/inventory/export", async (_req, res) => {
    const s = await db.read(account(res));
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("autobridge-inventory.xlsx")
      .send(await createSpreadsheet(s.products));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/inventory/preview",
    upload.single("file"),
    async (req, res) => {
      assert(req.file, "Choose an Excel or CSV file");
      const data = await readSpreadsheet(
        req.file.buffer,
        req.file.originalname,
      );
      res.json({
        ...data,
        ...mapRows(data.rows, data.mapping),
        version: (await db.read(account(res))).inventoryVersion,
      });
    },
  );
  const mappingSchema = z.object(
    Object.fromEntries(importFields.map((f) => [f, z.string().max(100)])),
  );
  const importInput = z.object({
    rows: z
      .array(z.record(z.string(), z.string().max(5000)))
      .min(1)
      .max(5000),
    mapping: mappingSchema,
    version: z.number().int(),
  });
  app.post("/api/inventory/map", async (req, res) => {
    const input = importInput.parse(req.body);
    res.json(mapRows(input.rows, input.mapping as Mapping));
  });
  app.post("/api/inventory/import", async (req, res) => {
    const input = importInput.parse(req.body);
    const result = mapRows(input.rows, input.mapping as Mapping);
    assert(
      !result.errors.length,
      "Resolve all spreadsheet errors before importing",
    );
    await db.mutate(account(res), (s) => {
      importProducts(s, result.products, input.version);
      s.onboardingStep = Math.max(3, s.onboardingStep);
    });
    res.json({ count: result.products.length });
  });
  app.post("/api/inventory/sample", async (_req, res) => {
    await db.mutate(account(res), (s) => {
      assert(
        !s.products.length,
        "Sample products can only be added to an empty catalogue",
      );
      importProducts(s, sampleProducts, s.inventoryVersion);
      s.onboardingStep = Math.max(3, s.onboardingStep);
      s.demo = true;
    });
    res.json({ ok: true });
  });
  app.put("/api/products/:sku", async (req, res) => {
    const input = z
      .object({ product: productSchema, version: z.number().int() })
      .parse(req.body);
    assert(
      input.product.sku === req.params.sku,
      "Product code cannot be changed",
    );
    await db.mutate(account(res), (s) => {
      assert(
        s.products.some((p) => p.sku === input.product.sku),
        "Product not found",
        404,
      );
      importProducts(s, [input.product], input.version);
    });
    res.json({ ok: true });
  });
  app.post("/api/simulator/quote", async (req, res) => {
    const cart = cartSchema.parse(req.body);
    const s = await db.read(account(res));
    res.json(quoteCart(s, cart, selectSimulatorRate(s, cart)));
  });
  app.post("/api/simulator/order", async (req, res) => {
    const cart = cartSchema.parse(req.body);
    const order = await db.mutate(account(res), (s) =>
      placeOrder(s, cart, selectSimulatorRate(s, cart)),
    );
    res.status(201).json(order);
  });
  app.post("/api/orders/:id/transition", async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["packed", "ready", "cancelled"]) })
      .parse(req.body);
    const order = await db.mutate(account(res), (s) =>
      transitionOrder(s, String(req.params.id), status),
    );
    res.json(order);
  });
  app.post("/api/orders/:id/book", async (req, res) => {
    res.json(
      await db.mutate(account(res), (s) =>
        bookSimulatedShipment(s, String(req.params.id)),
      ),
    );
  });
  app.post("/api/orders/:id/simulate-delivery", async (req, res) => {
    const { status } = z
      .object({
        status: z.enum([
          "picked_up",
          "in_transit",
          "delivery_failed",
          "delivered",
          "returned",
        ]),
      })
      .parse(req.body);
    res.json(
      await db.mutate(account(res), (s) => {
        const o = s.orders.find((o) => o.id === req.params.id);
        assert(o?.simulated, "Only simulated orders can use this action");
        assert(o.shipment, "Book a simulated shipment first");
        const result = transitionOrder(s, o.id, status as OrderStatus);
        result.shipment!.status = status.replaceAll("_", " ");
        return result;
      }),
    );
  });
  app.post("/api/tickets", async (req, res) => {
    const input = z
      .object({
        orderId: z.string(),
        type: z.enum(["return", "cancellation", "delivery", "other"]),
        reason: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);
    await db.mutate(account(res), (s) => {
      const order = s.orders.find((o) => o.id === input.orderId);
      assert(order, "Order not found", 404);
      if (input.type === "return") {
        assert(
          order.status === "delivered",
          "Returns require a delivered order",
        );
        assert(
          order.rules.returnDays > 0 &&
            Date.now() - Date.parse(order.updatedAt) <=
              order.rules.returnDays * 86400000,
          "Return window has closed",
        );
      }
      s.tickets.unshift({
        ...input,
        id: randomUUID(),
        status: "open",
        createdAt: new Date().toISOString(),
      });
      record(s, "support.opened", input.orderId);
    });
    res.status(201).json({ ok: true });
  });
  app.put("/api/tickets/:id", async (req, res) => {
    const input = z
      .object({
        status: z.enum(["reviewing", "resolved"]),
        resolution: z.string().trim().min(3).max(2000),
      })
      .parse(req.body);
    await db.mutate(account(res), (s) => {
      const ticket = s.tickets.find((t) => t.id === req.params.id);
      assert(ticket, "Request not found", 404);
      Object.assign(ticket, input);
      record(s, "support.updated", ticket.id);
    });
    res.json({ ok: true });
  });
  app.get("/api/payments/export", async (_req, res) => {
    const s = await db.read(account(res));
    const escape = (v: string) =>
      `"${v.replaceAll('"', '""').replace(/^[=+@-]/, "'")}"`;
    res
      .type("text/csv")
      .attachment("order-payment-records.csv")
      .send(
        [
          "Order,Created,Mode,Total INR,Payment status,Settlement status",
          ...s.orders.map((o) =>
            [
              o.id,
              o.createdAt,
              o.simulated ? "SIMULATED" : "LIVE",
              (o.quote.total / 100).toFixed(2),
              o.payment,
              o.simulated ? "Not applicable" : "Not connected",
            ]
              .map(escape)
              .join(","),
          ),
        ].join("\r\n"),
      );
  });
  app.post("/api/onboarding/complete", async (_req, res) => {
    await db.mutate(account(res), (s) => {
      assert(
        s.business && s.products.length,
        "Complete business details and inventory first",
      );
      s.onboarded = true;
      s.onboardingStep = 6;
      record(
        s,
        "onboarding.completed",
        "Portal ready; network activation is separate",
      );
    });
    res.json({ ok: true });
  });
  attachProtocolRoutes(app, db);
  attachBuildRoutes(app, db);
  return app;
}
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.too.large"
  )
    return res
      .status(413)
      .json({
        error: "Request is too large. Split this import into smaller files.",
      });
  if (error instanceof SyntaxError && "status" in error && error.status === 400)
    return res.status(400).json({ error: "Invalid JSON request" });
  if (error instanceof z.ZodError)
    return res.status(400).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  if (error instanceof DomainError)
    return res
      .status(error.status)
      .json({ error: error.message, code: error.code });
  if (error instanceof multer.MulterError)
    return res.status(400).json({ error: error.message });
  console.error(
    error instanceof Error ? error.message : "Unexpected server error",
  );
  res
    .status(500)
    .json({ error: "This action could not be completed. Please try again." });
}
