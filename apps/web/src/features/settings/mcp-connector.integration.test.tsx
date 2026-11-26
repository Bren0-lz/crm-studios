import { createHash } from "node:crypto";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

const tokenHash = createHash("sha256").update("t".repeat(43)).digest("hex");

function configureMcp() {
  vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://crm.example.com");
  vi.stubEnv("MCP_ACCESS_TOKEN_SHA256", tokenHash);
}

async function openMcp() {
  open("/configuracoes?secao=integracoes&integracao=mcp");
  const panel = await screen.findByRole("tabpanel", { name: "Integrações" });
  return within(panel).findByRole("region", { name: "Manual MCP" });
}

describe("Manual MCP em Configurações › Integrações (INT5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("abre pela navegação de integrações e mostra o endereço, os passos e a cópia", async () => {
    configureMcp();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await setupApi();
    open("/configuracoes?secao=integracoes");
    const nav = await screen.findByRole("navigation", {
      name: "Páginas de integrações",
    });
    fireEvent.click(within(nav).getByRole("link", { name: "Manual MCP" }));
    const section = await screen.findByRole("region", { name: "Manual MCP" });
    expect(screen.getByRole("link", { name: "Manual MCP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("region", { name: "Chaves de API" })).toBeNull();
    expect(await within(section).findByText("Ligado")).toBeInTheDocument();
    const endpoint = within(section).getByLabelText<HTMLInputElement>(
      "Endereço do conector",
    );
    expect(endpoint.value).toBe("https://crm.example.com/api/mcp");
    expect(endpoint).toHaveAttribute("readonly");
    expect(
      within(section).getByText(/não lê nem altera os dados da clínica/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/Adicionar conector personalizado/),
    ).toBeInTheDocument();
    expect(within(section).getByText(/Em Request headers/)).toBeInTheDocument();
    expect(section).not.toHaveTextContent(tokenHash);

    fireEvent.click(
      within(section).getByRole("button", { name: "Copiar endereço" }),
    );
    await within(section).findByRole("button", { name: "Copiado" });
    expect(writeText).toHaveBeenLastCalledWith(
      "https://crm.example.com/api/mcp",
    );
  });

  it("sem área de transferência, pede para copiar à mão", async () => {
    configureMcp();
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    await setupApi();
    const section = await openMcp();
    fireEvent.click(
      await within(section).findByRole("button", { name: "Copiar endereço" }),
    );
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "Selecione o endereço e copie manualmente.",
    );
    expect(
      within(section).getByRole("button", { name: "Copiar endereço" }),
    ).toBeInTheDocument();
  });

  it("mostra o conector desligado sem endereço nem passos", async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "");
    vi.stubEnv("MCP_ACCESS_TOKEN_SHA256", "");
    await setupApi();
    const section = await openMcp();
    expect(await within(section).findByText("Desligado")).toBeInTheDocument();
    expect(within(section).getByText("Conector desligado")).toBeInTheDocument();
    expect(within(section).queryByLabelText("Endereço do conector")).toBeNull();
    expect(
      within(section).queryByText(/Adicionar conector personalizado/),
    ).toBeNull();
  });

  it("mostra carregando, depois o erro e tenta de novo", async () => {
    configureMcp();
    await setupApi();
    const fetchMock = vi.mocked(fetch);
    const real = fetchMock.getMockImplementation()!;
    let failing = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (input, init) => {
      if (!String(input).includes("/integrations/mcp"))
        return real(input, init);
      await gate;
      if (!failing) return real(input, init);
      return {
        ok: false,
        status: 500,
        json: async () => ({
          code: "INTERNAL",
          message: "Falha ao consultar o conector.",
        }),
        text: async () => "",
      } as Response;
    });
    const section = await openMcp();
    expect(section.querySelector(".loading-block")).not.toBeNull();
    release();
    expect(
      await within(section).findByText("Falha ao consultar o conector."),
    ).toBeInTheDocument();
    failing = false;
    fireEvent.click(
      within(section).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await within(section).findByLabelText("Endereço do conector"),
    ).toHaveValue("https://crm.example.com/api/mcp");
  });
});
