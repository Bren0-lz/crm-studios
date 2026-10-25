import { nextTestCpf } from "../../test-support/cpf.js";
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
      payload: {
        cpf: nextTestCpf(),
        fullName: "André Conceição",
        phone: "11955550000",
        tags: [],
      },
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

  it("saves the nickname and finds the client by it", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Maria Aparecida Lima",
        nickname: "  Cidinha  ",
        phone: "11955551111",
        tags: [],
      },
    });
    expect(created.statusCode).toBe(201);
    const saved = created.json<Record<string, unknown>>();
    expect(saved.nickname).toBe("Cidinha");
    for (const term of ["cidinha", "CIDINHA"]) {
      const found = await app.inject({
        method: "GET",
        url: `/patients?search=${encodeURIComponent(term)}`,
        headers,
      });
      expect(
        found.json().map((item: { fullName: string }) => item.fullName),
      ).toEqual(["Maria Aparecida Lima"]);
    }
    const updated = await app.inject({
      method: "PUT",
      url: `/patients/${String(saved.id)}`,
      headers,
      payload: { ...saved, nickname: "Cida" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().nickname).toBe("Cida");
    const tooLong = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Outra Cliente",
        nickname: "a".repeat(81),
        phone: "11955552222",
        tags: [],
      },
    });
    expect(tooLong.statusCode).toBe(400);
    await app.close();
  });
});
