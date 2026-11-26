import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const token = "t".repeat(43);
const tokenHash = createHash("sha256").update(token).digest("hex");

let apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const admin = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
  return { app, repository, admin };
}

function configureMcp() {
  vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://crm.example.com");
  vi.stubEnv("MCP_ACCESS_TOKEN_SHA256", tokenHash);
}

describe("conector MCP do manual em Integrações (INT5)", () => {
  it("mostra ao admin o endereço do MCP ligado, sem o hash nem o token", async () => {
    configureMcp();
    const { app, admin } = await setup();
    const response = await app.inject({
      url: "/integrations/mcp",
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      endpoint: "https://crm.example.com/api/mcp",
    });
    expect(response.body).not.toContain(tokenHash);
    expect(response.body).not.toContain(token);
  });

  it.each([
    ["sem configuração", undefined],
    ["com hash inválido", "invalido"],
  ])("diz que está desligado %s", async (_label, hash) => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://crm.example.com");
    vi.stubEnv("MCP_ACCESS_TOKEN_SHA256", hash);
    const { app, admin } = await setup();
    const response = await app.inject({
      url: "/integrations/mcp",
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: false, endpoint: null });
  });

  it("recusa quem não é admin e quem não está logado", async () => {
    configureMcp();
    const { app, repository, admin } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Recepção MCP",
        email: `${randomUUID()}@test.local`,
        role: "user",
        password: "Password123",
      },
      "unused-hash",
    );
    const allowed = await app.inject({
      url: "/integrations/mcp",
      headers: admin,
    });
    expect(allowed.statusCode).toBe(200);
    const forbidden = await app.inject({
      url: "/integrations/mcp",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.body).not.toContain("crm.example.com");
    const anonymous = await app.inject({ url: "/integrations/mcp" });
    expect(anonymous.statusCode).toBe(401);
  });
});
