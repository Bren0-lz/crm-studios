import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isApiPath, stripApiPrefix } from "./api-prefix.js";
import { createWebHandler } from "./web-static.js";

describe("api prefix", () => {
  it("recognizes only /api and its sub-paths", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/patients")).toBe(true);
    expect(isApiPath("/api?x=1")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/clientes")).toBe(false);
    expect(stripApiPrefix("/api/auth/login")).toBe("/auth/login");
  });
});

describe("web static handler", () => {
  let base: string;
  let root: string;
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "crm-web-"));
    root = join(base, "dist");
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "index.html"), "<!doctype html><p>app</p>");
    await writeFile(join(root, "assets", "app-1a2b.js"), "console.log(1)");
    await writeFile(join(base, "secret.txt"), "não pode sair");
    const handler = createWebHandler(root);
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
    await rm(base, { recursive: true, force: true });
  });

  it("serves built files with type and long cache for hashed assets", async () => {
    const response = await fetch(`${origin}/assets/app-1a2b.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/javascript/);
    expect(response.headers.get("cache-control")).toMatch(/immutable/);
    expect(await response.text()).toBe("console.log(1)");
  });

  it("falls back to index.html for SPA routes without caching it", async () => {
    for (const path of ["/", "/clientes/123", "/agenda?dia=2026-10-30"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toContain("<p>app</p>");
    }
  });

  it("answers 404 for missing files and never leaves the site folder", async () => {
    expect((await fetch(`${origin}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${origin}/%2e%2e/secret.txt`)).status).toBe(404);
    expect((await fetch(`${origin}/..%2fsecret.txt`)).status).toBe(404);
  });

  it("rejects writes", async () => {
    const response = await fetch(`${origin}/clientes`, { method: "POST" });
    expect(response.status).toBe(405);
  });
});
