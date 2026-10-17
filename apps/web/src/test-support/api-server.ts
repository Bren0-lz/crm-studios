import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { buildApp } from "../../../api/src/app.js";
import { MemoryClinicRepository } from "../../../api/src/memory-repository.js";

// The browser transformer gives modules HTTP URLs; API configuration remains
// explicit and isolated instead of resolving a filesystem .env in jsdom.
vi.mock("../../../api/src/config.js", () => ({
  config: {
    NODE_ENV: "test",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "isolated-dom-api-tests-with-at-least-32-characters",
  },
}));

export const clinicId = "11111111-1111-4111-8111-111111111111";
export const actorId = "22222222-2222-4222-8222-222222222222";
const servers: Awaited<ReturnType<typeof buildApp>>[] = [];
const cleanups: Array<() => void> = [];

afterEach(async () => {
  cleanup();
  for (const restore of cleanups.splice(0)) restore();
  await Promise.all(servers.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});

export function captureDownloads() {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const blobs: Blob[] = [];
  URL.createObjectURL = (blob) => {
    blobs.push(blob as Blob);
    return "blob:test-download";
  };
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  cleanups.push(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
  return blobs;
}

/** Real HTTP handlers and an isolated repository, without opening a port. */
export async function setupApi() {
  const repository = new MemoryClinicRepository(false);
  const app = await buildApp({ repository, logger: false });
  servers.push(app);
  const token = app.jwt.sign({ sub: actorId, clinicId, role: "admin" });
  const headers = { authorization: `Bearer ${token}` };
  const me = await app.inject({ url: "/me", headers });
  expect(me.statusCode).toBe(200);
  localStorage.setItem("crm.auth.token", token);
  localStorage.setItem("crm.auth.user", me.body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const response = await app.inject({
        method: (init?.method ?? "GET") as "GET",
        url: url.pathname.replace(/^\/api(?=\/)/, "") + url.search,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        ...(init?.body ? { payload: String(init.body) } : {}),
      });
      return {
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        json: async () => response.json(),
        text: async () => response.body,
        blob: async () => new Blob([new Uint8Array(response.rawPayload)]),
      } as Response;
    }),
  );
  return { repository, app, headers };
}
