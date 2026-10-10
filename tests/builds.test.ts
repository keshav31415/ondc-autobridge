import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import {
  BuildWorkspace,
  configurationFrom,
  queueBuild,
  processBuilds,
  artifactRoot,
} from "../apps/api/src/builds";
import { Database } from "../apps/api/src/database";
import { businessSchema } from "../packages/core/src/domain";
import { sampleProducts } from "../apps/api/src/spreadsheets";
const db = await Database.open(undefined, true);
const directory = await mkdtemp(join(tmpdir(), "autobridge-build-"));
process.env.ARTIFACT_DIR = directory;
afterAll(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
  delete process.env.ARTIFACT_DIR;
});
async function merchant() {
  const id = await db.createAccount(
    `build-${Date.now()}@example.test`,
    "not-a-real-password",
  );
  await db.mutate(id, (s) => {
    s.business = businessSchema.parse({
      name: "Local shop",
      owner: "Local Owner",
      phone: "9876543210",
      email: "local@example.test",
      address: "Test pickup address",
      city: "Delhi",
      pincode: "110001",
    });
    s.products = structuredClone(sampleProducts);
  });
  return id;
}
describe("seller service builds", () => {
  it("requires validation, prevents AI changes to approved prices and bounds repairs", async () => {
    const input = configurationFrom(await db.read(await merchant())),
      workspace = new BuildWorkspace(input);
    expect(() => workspace.finish()).toThrow();
    const changed = structuredClone(input);
    changed.products[0].price++;
    expect(() => workspace.write(changed)).toThrow(/preserve/);
    workspace.write(input);
    expect(() => workspace.finish()).toThrow();
    expect(workspace.validate().passed).toBe(true);
    expect(workspace.finish()).toEqual(input);
    workspace.write(input);
    expect(() => workspace.finish()).toThrow();
    expect(() => workspace.write(input)).toThrow(/limit/);
  });
  it("builds from the queued snapshot, exports runnable sources and excludes secrets and orders", async () => {
    const id = await merchant();
    await db.mutate(id, (s) => {
      s.products[0].reserved = 2;
    });
    const job = await queueBuild(db, id, "template");
    await expect(queueBuild(db, id, "template")).rejects.toThrow(/already/);
    await db.mutate(id, (s) => {
      s.rules.discountPercent = 12;
    });
    await processBuilds(db);
    const state = await db.read(id),
      build = state.builds[0];
    expect(build.status).toBe("passed");
    expect(build.logs.some((l) => l.message.includes("SHA-256"))).toBe(true);
    const input = JSON.parse(
      await readFile(join(directory, job.id, "merchant.json"), "utf8"),
    );
    expect(input.rules.discountPercent).toBe(0);
    expect(input.products[0].stock).toBe(sampleProducts[0].stock - 2);
    expect(input.products[0].reserved).toBe(0);
    expect(input.orders).toBeUndefined();
    expect(input.password).toBeUndefined();
    const { stdout } = await promisify(execFile)("tar", [
      "-tzf",
      join(artifactRoot(), `${job.id}.tar.gz`),
    ]);
    expect(stdout).toContain("./scripts/service.ts");
    expect(stdout).toContain("./apps/api/src/index.ts");
    expect(stdout).not.toContain(".env\n");
    expect(stdout).not.toContain("node_modules");
    const output = join(directory, job.id);
    await symlink(
      join(process.cwd(), "node_modules"),
      join(output, "node_modules"),
      "dir",
    );
    const child = spawn(
      process.execPath,
      [
        join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
        "scripts/service.ts",
      ],
      {
        cwd: output,
        env: {
          ...process.env,
          PORT: "0",
          DATA_DIR: join(directory, "service-data"),
          BOOTSTRAP_EMAIL: "test-owner@example.test",
          BOOTSTRAP_PASSWORD: "local-fixture-password-only",
          INLINE_WORKER: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let startup = "";
    const exit = once(child, "exit");
    try {
      const base = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Generated service startup timed out")),
          15000,
        );
        child.stdout.on("data", (chunk) => {
          startup += chunk.toString();
          const match = startup.match(
            /AutoBridge API: (http:\/\/127.0.0.1:\d+)/,
          );
          if (match) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Generated service exited before ready"));
        });
      });
      expect((await (await fetch(`${base}/health`)).json()).status).toBe("ok");
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-autobridge-client": "portal",
        },
        body: JSON.stringify({
          email: "test-owner@example.test",
          password: "local-fixture-password-only",
        }),
      });
      expect(login.status).toBe(200);
      expect((await login.json()).state.products).toHaveLength(8);
    } finally {
      child.kill("SIGTERM");
      await exit;
    }
  });
});
