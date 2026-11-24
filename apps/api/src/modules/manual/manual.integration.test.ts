import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const token = "piloto-somente-teste-0000000000000000000000000";
const headers = { authorization: `Bearer ${token}` };
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "teste", version: "1" },
  },
};

describe("manual MCP isolado do CRM", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let client: Client | undefined;
  let repository: MemoryClinicRepository;
  beforeEach(async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://crm.example.com");
    vi.stubEnv(
      "MCP_ACCESS_TOKEN_SHA256",
      createHash("sha256").update(token).digest("hex"),
    );
    repository = new MemoryClinicRepository(false);
    app = await buildApp({ repository, logger: false });
  });
  afterEach(async () => {
    await client?.close();
    client = undefined;
    await app.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  async function connect() {
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    client = new Client({ name: "piloto-manual-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${address}/mcp`), {
        requestInit: { headers },
      }),
    );
    return client;
  }
  it("inicializa, lista uma ferramenta e consulta clientes usando cliente oficial e HTTP real, sem buscar dados do CRM", async () => {
    const findUser = vi.spyOn(repository, "findUserById");
    const patients = vi.spyOn(repository, "listPatients");
    const sdk = await connect();
    const tools = await sdk.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "consultar_manual_crm",
    ]);
    expect(tools.tools[0]?.inputSchema).toMatchObject({
      properties: { consulta: { maxLength: 300 } },
    });
    const result = await sdk.callTool({
      name: "consultar_manual_crm",
      arguments: { consulta: "Como cadastrar um novo cliente?" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "evidencia_encontrada",
      revisao: {
        fontes: expect.stringMatching(/^[a-f0-9]{40}$/),
        material: expect.stringMatching(/^sha256:/),
      },
      trechos: [
        expect.objectContaining({
          id: "cadastrar-cliente",
          trecho: expect.stringContaining("Salvar cliente"),
          referencias: expect.arrayContaining([
            expect.objectContaining({ url: expect.stringContaining("/blob/") }),
          ]),
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Cliente Navegador|52998224725|function |describe\(/,
    );
    expect(findUser).not.toHaveBeenCalled();
    expect(patients).not.toHaveBeenCalled();
  });
  it("retorna falta de evidência e rejeita consulta acima de 300 caracteres", async () => {
    const sdk = await connect();
    const result = await sdk.callTool({
      name: "consultar_manual_crm",
      arguments: { consulta: "Como emitir nota fiscal eletrônica?" },
    });
    expect(result.structuredContent).toMatchObject({
      status: "evidencia_insuficiente",
      trechos: [],
    });
    const oversized = await sdk.callTool({
      name: "consultar_manual_crm",
      arguments: { consulta: "x".repeat(301) },
    });
    expect(oversized.isError).toBe(true);
    const padded = await sdk.callTool({
      name: "consultar_manual_crm",
      arguments: { consulta: "cliente" + " ".repeat(294) },
    });
    expect(padded.isError).toBe(true);
    const unsupported = await sdk.callTool({
      name: "ler_banco_crm",
      arguments: {},
    });
    expect(unsupported.isError).toBe(true);
    await expect(sdk.listResources()).rejects.toThrow();
  });
  it("rejeita credenciais ausentes, inválidas, JWT do CRM e token na URL antes de processar o corpo", async () => {
    for (const authorization of [
      undefined,
      "Bearer incorreto",
      "Bearer eyJhbGciOiJIUzI1NiJ9.token-do-crm.assinatura",
    ]) {
      const result = await app.inject({
        method: "POST",
        url: `/mcp?token=${token}`,
        headers: {
          ...(authorization ? { authorization } : {}),
          "content-type": "application/json",
        },
        payload: "JSON inválido",
      });
      expect(result.statusCode).toBe(401);
      expect(result.headers["www-authenticate"]).toContain("Bearer");
    }
    expect(
      (await app.inject({ method: "GET", url: "/health" })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/patients" })).statusCode,
    ).toBe(401);
  });
  it("rejeita corpo inválido ou excessivo sem expor seu conteúdo", async () => {
    const malformed = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { ...headers, "content-type": "application/json" },
      payload: "JSON inválido",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ code: "MCP_REQUEST_ERROR" });
    const oversized = await app.inject({
      method: "POST",
      url: "/mcp",
      headers,
      payload: { consulta: "x".repeat(20_000) },
    });
    expect(oversized.statusCode).toBe(413);
  });
  it.each([
    ["MCP_ACCESS_TOKEN_SHA256", undefined],
    ["MCP_ACCESS_TOKEN_SHA256", "invalido"],
    ["MCP_PUBLIC_ORIGIN", undefined],
    ["MCP_PUBLIC_ORIGIN", ""],
    ["MCP_PUBLIC_ORIGIN", "crm.example.com"],
    ["MCP_PUBLIC_ORIGIN", "https://crm.example.com/"],
  ])("desativa apenas o MCP com %s igual a %j", async (name, value) => {
    await app.close();
    vi.stubEnv(name, value);
    app = await buildApp({ repository, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers,
      payload: initialize,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: "MCP_UNAVAILABLE" });
    expect(
      (await app.inject({ method: "GET", url: "/health" })).statusCode,
    ).toBe(200);
  });
  it("rejeita Origin externo, limita requisições e não abre streams GET", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/mcp",
          headers: { ...headers, origin: "https://intruso.example" },
          payload: initialize,
        })
      ).statusCode,
    ).toBe(403);
    for (let i = 0; i < 120; i++)
      expect(
        (await app.inject({ method: "GET", url: "/mcp", headers })).statusCode,
      ).toBe(405);
    const limited = await app.inject({ method: "GET", url: "/mcp", headers });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
  });
});
