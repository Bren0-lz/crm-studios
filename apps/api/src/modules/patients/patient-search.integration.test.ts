import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("patient search", () => {
  it("ignores accents and letter case", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: { fullName: "André Conceição", phone: "11955550000", tags: [] },
    });
    expect(created.statusCode).toBe(201);
    for (const term of ["andre", "ANDRÉ", "conceicao"]) {
      const found = await app.inject({
        method: "GET",
        url: `/patients?search=${encodeURIComponent(term)}`,
        headers,
      });
      expect(
        found.json().map((item: { fullName: string }) => item.fullName),
      ).toContain("André Conceição");
    }
    await app.close();
  });
});
