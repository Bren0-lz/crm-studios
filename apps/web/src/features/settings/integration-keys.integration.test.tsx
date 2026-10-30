import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

describe("integration keys through real HTTP handlers", () => {
  it("creates a key showing the token once, then revokes it", async () => {
    const { repository } = await setupApi();
    open("/configuracoes?secao=integracoes");
    const panel = await screen.findByRole("tabpanel", { name: "Integrações" });
    await within(panel).findByText("Nenhuma chave criada");
    change("Nome", "Dashboard de vendas", panel);
    fireEvent.click(within(panel).getByLabelText("Gravar vendas"));
    fireEvent.click(within(panel).getByRole("button", { name: "Criar chave" }));
    const token = (await within(panel).findByLabelText("Token")) as HTMLInputElement;
    expect(token.value).toMatch(/^crm_[0-9a-f]{8}_/);
    const [key] = await repository.listIntegrationKeys(clinicId);
    expect(key).toMatchObject({
      name: "Dashboard de vendas",
      scopes: ["sales:read", "sales:write"],
    });
    expect(within(panel).getByText(/Ler vendas, Gravar vendas/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Fechar" }));
    expect(within(panel).queryByLabelText("Token")).toBeNull();

    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Revogar chave Dashboard de vendas",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Revogar chave" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revogar" }));
    await within(panel).findByText("Chave revogada.");
    expect(within(panel).getByText("Revogada")).toBeInTheDocument();
    expect(
      (await repository.listIntegrationKeys(clinicId))[0]?.revokedAt,
    ).toEqual(expect.any(String));
  });
});
