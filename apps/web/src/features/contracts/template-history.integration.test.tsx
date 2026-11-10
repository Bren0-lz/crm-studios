import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

describe("document template history", () => {
  it("lists versions with author and changes, and restores an old version", async () => {
    const { repository } = await setupApi();
    const first = await repository.createDocumentTemplate(
      clinicId,
      {
        name: "Contrato Pilates",
        kind: "contract",
        body: "Contrato de {{paciente_nome}}.\nValor mensal: R$ 300.",
      },
      actorId,
    );
    await repository.createDocumentTemplateVersion(
      clinicId,
      first.id,
      "Contrato de {{paciente_nome}}.\nValor mensal: R$ 350.\nMulta de 10%.",
      undefined,
      { actorId },
    );
    open("/contratos");
    fireEvent.click(await screen.findByRole("tab", { name: /Modelos/ }));
    // A lista mostra só a versão em uso; as antigas ficam no histórico.
    expect(screen.queryByText("Histórica")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Histórico do modelo Contrato Pilates",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Histórico do modelo" });
    const versions = within(dialog).getByRole("list", {
      name: "Versões do modelo",
    });
    expect(within(versions).getAllByRole("button")).toHaveLength(2);
    expect(dialog).toHaveTextContent(
      "Comparada à versão 1: 2 linhas incluídas · 1 linha removida.",
    );
    expect(within(dialog).getByText("Valor mensal: R$ 300.").tagName).toBe(
      "DEL",
    );
    expect(within(dialog).getByText("Multa de 10%.").tagName).toBe("INS");
    expect(dialog).toHaveTextContent(/por \S+/);

    fireEvent.click(within(versions).getByRole("button", { name: /Versão 1/ }));
    expect(dialog).toHaveTextContent("Primeira versão do modelo.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Restaurar versão 1/ }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Histórico do modelo" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(
        "Versão 1 de “Contrato Pilates” restaurada como versão 3.",
      ),
    ).toBeInTheDocument();
    const templates = await repository.listDocumentTemplates(clinicId);
    const active = templates.find(
      (item) => item.name === "Contrato Pilates" && item.active,
    )!;
    expect(active).toMatchObject({
      version: 3,
      restoredFromVersion: 1,
      body: first.body,
      createdById: actorId,
    });
  });
});
