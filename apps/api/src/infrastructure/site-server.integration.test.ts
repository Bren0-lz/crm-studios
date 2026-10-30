import type { FastifyInstance } from "fastify";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { MemoryClinicRepository } from "../memory-repository.js";
import { createSiteServer, resolveSitePath } from "./site-server.js";

let webDir: string;
let app: FastifyInstance;
let server: Server;
let base: string;

beforeAll(async () => {
  webDir = await mkdtemp(join(tmpdir(), "crm-site-"));
  await mkdir(join(webDir, "assets"));
  await writeFile(join(webDir, "index.html"), "<div id=root></div>");
  await writeFile(join(webDir, "assets", "app-abc123.js"), "console.log(1)");
  app = await buildApp({
    repository: new MemoryClinicRepository(true),
    logger: false,
  });
  await app.ready();
  server = createSiteServer(app, webDir);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await app?.close();
  if (webDir) await rm(webDir, { recursive: true, force: true });
});

/** Requisição crua: o `fetch` normalizaria o caminho antes de enviar. */
function rawGet(path: string) {
  return new Promise<number>((resolve, reject) => {
    request(`${base}${path}`, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
}

describe("site server (Hostinger)", () => {
  it("sends /api requests to the API without the prefix", async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@movimenta.local",
        password: "Admin@123",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("token");
  });

  it("serves the built site, falling back to index.html for app routes", async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(home.headers.get("cache-control")).toBe("no-cache");
    expect(await home.text()).toContain("root");

    const route = await fetch(`${base}/agenda?dia=2026-10-30`);
    expect(route.status).toBe(200);
    expect(await route.text()).toContain("root");
  });

  it("caches hashed assets and returns 404 for missing files", async () => {
    const asset = await fetch(`${base}/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");

    expect((await fetch(`${base}/assets/old-999.js`)).status).toBe(404);
  });

  it("refuses paths outside the site folder and non-GET methods", async () => {
    expect(await rawGet("/..%2f..%2fpackage.json")).toBe(400);
    expect(resolveSitePath(webDir, "/%2e%2e/%2e%2e/etc/passwd")).toBe(
      join(webDir, "etc", "passwd"),
    );
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405);
  });
});
