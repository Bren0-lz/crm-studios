import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open, save } from "../../test-support/workflow-ui";

describe("integration keys through real HTTP handlers", () => {
  it("creates a key showing the token once, then revokes it", async () => {
    const { repository } = await setupApi();
    open("/configuracoes?secao=integracoes");
    const panel = await screen.findByRole("tabpanel", { name: "Integrações" });
    await within(panel).findByText("Nenhuma chave ativa");
    fireEvent.click(within(panel).getByRole("button", { name: "Nova chave" }));
    const createDialog = screen.getByRole("dialog", { name: "Nova chave" });
    const form = within(createDialog);
    change("Nome", "Dashboard de vendas", createDialog);
    fireEvent.click(form.getByLabelText("Gravar vendas"));
    await save("Nova chave", "Criar chave");
    const result = within(screen.getByRole("dialog", { name: "Chave criada" }));
    const token = result.getByLabelText<HTMLInputElement>("Token");
    expect(token.value).toMatch(/^crm_[0-9a-f]{8}_/);
    const [key] = await repository.listIntegrationKeys(clinicId);
    expect(key).toMatchObject({
      name: "Dashboard de vendas",
      scopes: ["sales:read", "sales:write"],
    });
    expect(
      within(panel).getByText(/Ler vendas, Gravar vendas/),
    ).toBeInTheDocument();
    fireEvent.click(result.getByRole("button", { name: "Concluir" }));
    expect(within(panel).queryByLabelText("Token")).toBeNull();

    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Revogar chave Dashboard de vendas",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Revogar chave" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revogar" }));
    await within(panel).findByText("Chave revogada.");
    const history = within(panel)
      .getByText("Chaves revogadas (1)")
      .closest("details")!;
    expect(history).not.toHaveAttribute("open");
    fireEvent.click(within(history).getByText("Chaves revogadas (1)"));
    expect(within(history).getByText(/revogada em/)).toBeVisible();
    expect(
      (await repository.listIntegrationKeys(clinicId))[0]?.revokedAt,
    ).toEqual(expect.any(String));
  });

  it("shows every active key and discloses the revoked history separately", async () => {
    const { repository } = await setupApi();
    for (const name of ["Dashboard", "Agenda", "Painel antigo"]) {
      const key = await repository.createIntegrationKey(
        clinicId,
        actorId,
        { name, scopes: ["sales:read"] },
        { prefix: "crm_demo", tokenHash: name },
      );
      if (name === "Painel antigo")
        await repository.revokeIntegrationKey(clinicId, key.id);
    }

    open("/configuracoes?secao=integracoes&integracao=chaves");
    const active = within(
      await screen.findByRole("region", { name: "Chaves ativas (2)" }),
    );
    expect(
      active.getByRole("button", { name: "Revogar chave Dashboard" }),
    ).toBeVisible();
    expect(
      active.getByRole("button", { name: "Revogar chave Agenda" }),
    ).toBeVisible();
    expect(screen.getByText("Painel antigo")).not.toBeVisible();
    expect(screen.queryByLabelText("Token")).toBeNull();

    const summary = screen.getByText("Chaves revogadas (1)");
    fireEvent.click(summary);
    const history = within(summary.closest("details")!);
    expect(history.getByText("Painel antigo")).toBeVisible();
    expect(history.queryByRole("button", { name: /Revogar/ })).toBeNull();
  });
});
