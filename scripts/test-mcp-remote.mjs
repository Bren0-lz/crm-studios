// Smoke test do artefato local ou da URL de homologação/publicada. Nunca imprime a credencial.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const endpoint = process.env.MCP_TEST_URL;
const token = process.env.MCP_TEST_TOKEN;
assert(
  endpoint && token,
  "Defina MCP_TEST_URL e MCP_TEST_TOKEN somente no ambiente do teste.",
);
const url = new URL(endpoint);
assert(
  url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)),
  "Use HTTPS fora de localhost.",
);
const unauthenticated = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(15_000),
});
assert.equal(
  unauthenticated.status,
  401,
  "Acesso sem credencial deve retornar 401 (503 indica piloto desligado).",
);
const client = new Client({ name: "verificacao-manual-crm", version: "1.0.0" });
try {
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["consultar_manual_crm"],
  );
  const found = await client.callTool({
    name: "consultar_manual_crm",
    arguments: { consulta: "Como cadastrar um novo cliente?" },
  });
  assert.equal(found.structuredContent?.status, "evidencia_encontrada");
  assert(
    found.structuredContent.trechos.some((t) => t.id === "cadastrar-cliente"),
  );
  const missing = await client.callTool({
    name: "consultar_manual_crm",
    arguments: { consulta: "Como emitir nota fiscal eletrônica?" },
  });
  assert.equal(missing.structuredContent?.status, "evidencia_insuficiente");
  console.log(
    JSON.stringify(
      {
        inicializacao: "OK",
        ferramentas: tools.map((tool) => tool.name),
        cadastroCliente: "OK",
        semResultado: "OK",
        semCredencial: 401,
        revisao: found.structuredContent.revisao,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
