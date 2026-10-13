import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../../test-support/http";
import { ApiClientError } from "./ApiClientError";
import { login } from "./login";
import { clearSession, getStoredUser, hasSession, storeUser } from "./session";
import { request, requestBlob } from "./transport";

const user = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Usuária de teste",
  email: "user@example.com",
  role: "user" as const,
  modules: [],
  editModules: [],
  permissions: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
});

describe("HTTP transport and session", () => {
  it("sends the bearer token and preserves request options and custom headers", async () => {
    localStorage.setItem("crm.auth.token", "token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "created" }, 201));
    await expect(
      request("/patients", {
        method: "POST",
        body: "{}",
        headers: { "X-Trace": "trace" },
      }),
    ).resolves.toEqual({ id: "created" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/patients$/),
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "X-Trace": "trace",
        }),
      }),
    );
  });

  it("handles an empty 204 response without trying to parse JSON", async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, "json");
    vi.mocked(fetch).mockResolvedValue(response);
    await expect(
      request("/holidays/one", { method: "DELETE" }),
    ).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("preserves domain error codes, status and details", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          message: "Etiqueta em uso",
          code: "TAG_IN_USE",
          details: { patientCount: 2 },
        },
        409,
      ),
    );
    await expect(request("/patient-tags/one")).rejects.toMatchObject({
      message: "Etiqueta em uso",
      code: "TAG_IN_USE",
      status: 409,
      details: { patientCount: 2 },
    });
  });

  it("uses the fallback error when the server provides no details", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));
    await expect(request("/patients")).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
      status: 500,
    });
  });

  it.each(["json", "blob"])(
    "clears expired sessions and dispatches one event for %s requests",
    async (kind) => {
      localStorage.setItem("crm.auth.token", "expired");
      storeUser(user);
      const event = vi.fn();
      window.addEventListener("crm:session-ended", event);
      try {
        vi.mocked(fetch).mockResolvedValue(
          jsonResponse({ message: "Sessão expirada" }, 401),
        );
        await expect(
          kind === "json"
            ? request("/patients")
            : requestBlob("/patients/export"),
        ).rejects.toBeInstanceOf(ApiClientError);
        expect(hasSession()).toBe(false);
        expect(getStoredUser()).toBeNull();
        expect(event).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener("crm:session-ended", event);
      }
    },
  );

  it("keeps the session when login fails", async () => {
    localStorage.setItem("crm.auth.token", "existing");
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ code: "INVALID_CREDENTIALS" }, 401),
    );
    await expect(login("user@example.com", "wrong")).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(hasSession()).toBe(true);
  });

  it.each(["json", "blob"])(
    "dispatches access-denied without clearing the session for %s requests",
    async (kind) => {
      localStorage.setItem("crm.auth.token", "token");
      const event = vi.fn();
      window.addEventListener("crm:access-denied", event);
      try {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 403));
        await expect(
          kind === "json"
            ? request("/patients")
            : requestBlob("/patients/export"),
        ).rejects.toBeInstanceOf(ApiClientError);
        expect(event).toHaveBeenCalledTimes(1);
        expect(hasSession()).toBe(true);
      } finally {
        window.removeEventListener("crm:access-denied", event);
      }
    },
  );

  it("does not trigger another permission refresh when /me itself is denied", async () => {
    const event = vi.fn();
    window.addEventListener("crm:access-denied", event);
    try {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 403));
      await expect(request("/me")).rejects.toBeInstanceOf(ApiClientError);
      expect(event).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("crm:access-denied", event);
    }
  });

  it("downloads authenticated binary content and handles an anonymous download", async () => {
    localStorage.setItem("crm.auth.token", "token");
    vi.mocked(fetch).mockResolvedValue(new Response("csv-content"));
    expect((await requestBlob("/patients/export")).size).toBe(11);
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), {
      headers: { Authorization: "Bearer token" },
    });
    clearSession();
    vi.mocked(fetch).mockResolvedValue(new Response("csv-content"));
    await requestBlob("/patients/export");
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), { headers: {} });
  });

  it("propagates network failures without removing the session", async () => {
    localStorage.setItem("crm.auth.token", "token");
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(request("/patients")).rejects.toThrow("Failed to fetch");
    expect(hasSession()).toBe(true);
  });

  it("stores a successful login and discards corrupted stored users", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ token: "new-token", user }),
    );
    await login(user.email, "password");
    expect(getStoredUser()).toEqual(user);
    expect(hasSession()).toBe(true);
    localStorage.setItem("crm.auth.user", "{invalid");
    expect(getStoredUser()).toBeNull();
    expect(hasSession()).toBe(false);
  });
});
