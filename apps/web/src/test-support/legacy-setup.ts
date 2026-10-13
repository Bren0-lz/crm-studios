import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { api } from "../api";
import { originalMe, withPermissions } from "./legacy-fixtures";

vi.stubGlobal("fetch", vi.fn());

beforeEach(() => {
  vi.spyOn(api, "me").mockImplementation(async () => {
    const implementation =
      vi.mocked(fetch).getMockImplementation()?.toString() ?? "";
    if (implementation.includes("/me") || implementation.includes("401"))
      return originalMe();
    const current = localStorage.getItem("crm.auth.user");
    if (!current) throw new Error("Missing test session");
    return withPermissions(JSON.parse(current));
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
});
