import { describe, expect, it } from "vitest";
import { assertServerlessConfig, stripApiPrefix } from "./serverless.js";

describe("serverless entry", () => {
  it("strips the public /api prefix before routing", () => {
    expect(stripApiPrefix("/api/auth/login")).toBe("/auth/login");
    expect(stripApiPrefix("/api/patients?search=ana")).toBe("/patients?search=ana");
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api?x=1")).toBe("/?x=1");
    expect(stripApiPrefix("/apiary")).toBe("/apiary");
    expect(stripApiPrefix("/health")).toBe("/health");
  });

  it("refuses memory storage and the public default JWT secret", () => {
    const secret = "a".repeat(40);
    expect(() => assertServerlessConfig({ STORAGE_MODE: "memory", JWT_SECRET: secret })).toThrow(
      /STORAGE_MODE=postgres/,
    );
    expect(() =>
      assertServerlessConfig({
        STORAGE_MODE: "postgres",
        JWT_SECRET: "development-secret-change-before-production",
      }),
    ).toThrow(/JWT_SECRET/);
    expect(() => assertServerlessConfig({ STORAGE_MODE: "postgres", JWT_SECRET: secret })).not.toThrow();
  });
});
