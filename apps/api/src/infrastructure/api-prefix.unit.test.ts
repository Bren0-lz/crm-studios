import { describe, expect, it } from "vitest";
import { isApiPath, stripApiPrefix } from "./api-prefix.js";

describe("api prefix", () => {
  it("strips the public /api prefix before routing", () => {
    expect(stripApiPrefix("/api/auth/login")).toBe("/auth/login");
    expect(stripApiPrefix("/api/patients?search=ana")).toBe(
      "/patients?search=ana",
    );
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api?x=1")).toBe("/?x=1");
    expect(stripApiPrefix("/apiary")).toBe("/apiary");
    expect(stripApiPrefix("/health")).toBe("/health");
  });

  it("only treats /api and its subpaths as API requests", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/health")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/clientes/123")).toBe(false);
  });
});
