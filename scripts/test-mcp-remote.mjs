// Smoke do bundle Hostinger em memória (--local) ou de um deploy HTTPS.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import data from "../apps/api/src/modules/manual/manual-data.json" with { type: "json" };

const expectedRevision = {
  fontes: data.revisao,
  material: `sha256:${data.material}`,
};
const requestOptions = { timeout: 15_000 };
const bundle = fileURLToPath(
  new URL("../apps/api/dist/site-server.mjs", import.meta.url),
);

function postWithoutToken(url) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

async function verifyManual(url, token) {
  const unauthenticated = await postWithoutToken(url);
  assert.equal(
    unauthenticated.status,
    401,
    "Acesso sem credencial deve retornar 401 (503 indica piloto desligado).",
  );

  const client = new Client({
    name: "verificacao-manual-crm",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
        },
      }),
      requestOptions,
    );
    const { tools } = await client.listTools(undefined, requestOptions);
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["consultar_manual_crm"],
    );

    const consult = async (consulta) => {
      const result = await client.callTool(
        { name: "consultar_manual_crm", arguments: { consulta } },
        undefined,
        requestOptions,
      );
      assert.notEqual(result.isError, true, "A consulta MCP retornou um erro.");
      assert.deepEqual(
        result.structuredContent?.revisao,
        expectedRevision,
        "A revisão ou o hash do manual servido difere do corpus deste checkout.",
      );
      return result.structuredContent;
    };
    const found = await consult("Como cadastrar um novo cliente?");
    assert.equal(found.status, "evidencia_encontrada");
    assert(
      found.trechos.some(
        (item) =>
          item.id === "cadastrar-cliente" &&
          item.trecho.includes("Salvar cliente") &&
          item.referencias.length > 0,
      ),
    );
    const missing = await consult("Como emitir nota fiscal eletrônica?");
    assert.equal(missing.status, "evidencia_insuficiente");
    assert.deepEqual(missing.trechos, []);

    console.log(
      JSON.stringify(
        {
          inicializacao: "OK",
          ferramentas: tools.map((tool) => tool.name),
          cadastroCliente: "OK",
          semResultado: "OK",
          semCredencial: 401,
          revisao: expectedRevision,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

async function withLocalBundle(token, verify) {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  const released = once(probe, "close");
  probe.close();
  await released;

  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [bundle], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      API_PORT: String(port),
      STORAGE_MODE: "memory",
      SEED_DEMO_DATA: "false",
      MCP_PUBLIC_ORIGIN: "https://crm.example.test",
      MCP_ACCESS_TOKEN_SHA256: token
        ? createHash("sha256").update(token).digest("hex")
        : "",
    },
    stdio: "inherit",
  });
  const closed = once(child, "close");
  try {
    const deadline = Date.now() + 15_000;
    while (
      Date.now() < deadline &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      }).catch(() => null);
      if (response?.ok) {
        await verify(origin);
        return;
      }
      await delay(100);
    }
    throw new Error("O bundle Hostinger não respondeu em /api/health.");
  } finally {
    child.kill();
    await closed;
  }
}

if (process.argv.includes("--local")) {
  const token = randomBytes(32).toString("base64url");
  await withLocalBundle(token, async (origin) => {
    const url = new URL("/api/mcp", origin);
    await verifyManual(url, token);
    const patients = await fetch(`${origin}/api/patients`);
    assert.equal(patients.status, 401);
    const web = await fetch(`${origin}/clientes`);
    assert.equal(web.status, 200);
    assert.match(web.headers.get("content-type"), /^text\/html/);
  });
  await withLocalBundle(undefined, async (origin) => {
    const disabled = await postWithoutToken(new URL("/api/mcp", origin));
    assert.equal(disabled.status, 503);
    assert.deepEqual(await disabled.json(), { code: "MCP_UNAVAILABLE" });
    console.log("MCP desativado: 503. CRM disponível.");
  });
} else {
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
  try {
    await verifyManual(url, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replaceAll(token, "[credencial omitida]"));
  }
}
