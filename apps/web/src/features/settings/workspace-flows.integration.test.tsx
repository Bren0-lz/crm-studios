import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open, change, expand, save } from "../../test-support/workflow-ui";

describe("settings workflows through real HTTP handlers", () => {
  it("validates, saves and removes a clinic logo while retaining the remaining settings", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    const input = await screen.findByLabelText("Logotipo");
    fireEvent.change(input, {
      target: {
        files: [new File(["texto"], "logo.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("Use PNG ou JPEG de até 2 MB.");
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      ),
      (char) => char.charCodeAt(0),
    );
    fireEvent.change(input, {
      target: { files: [new File([bytes], "logo.png", { type: "image/png" })] },
    });
    await screen.findByRole("img", { name: "Logotipo da clínica" });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.getClinicSettings(clinicId))?.logoDataUrl,
      ).toMatch(/^data:image\/png;base64,/),
    );
    await screen.findByRole("button", { name: "Salvar configurações" });
    fireEvent.click(screen.getByRole("button", { name: "Remover logotipo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(await repository.getClinicSettings(clinicId)).toMatchObject({
        logoDataUrl: "",
        timezone: "America/Sao_Paulo",
      }),
    );
  });
  it("creates and deactivates a supplier without losing its contact details", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    const panel = expand("Fornecedores");
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo fornecedor" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo fornecedor" });
    change("Nome", "Fornecedor de faixas", dialog);
    change("Tipo", "person", dialog);
    change("CPF / CNPJ", "12345678900", dialog);
    change("Telefone", "11988887777", dialog);
    change("E-mail", "fornecedor@example.com", dialog);
    change("Observações", "Contato comercial", dialog);
    await save("Novo fornecedor", "Salvar fornecedor");
    fireEvent.click(within(panel).getByRole("button", { name: "Editar" }));
    dialog = screen.getByRole("dialog", { name: "Editar fornecedor" });
    fireEvent.click(within(dialog).getByLabelText("Ativo"));
    await save("Editar fornecedor", "Salvar fornecedor");
    expect(await repository.listSuppliers(clinicId)).toMatchObject([
      {
        name: "Fornecedor de faixas",
        active: false,
        email: "fornecedor@example.com",
        kind: "person",
      },
    ]);
  });
  it("creates and renames a shared interest, preserving its reference on a client", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    fireEvent.click(await screen.findByRole("tab", { name: "Cadastros" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cadastro" }),
    );
    change("Nome", "Reabilitação", screen.getByRole("dialog"));
    await save("Novo cadastro");
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do catálogo",
      phone: "11988887777",
      tags: [],
      interests: ["Reabilitação"],
    });
    const row = (
      await screen.findByText("Reabilitação", { exact: true })
    ).closest(".table-row")!;
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Editar" }),
    );
    change("Nome", "Postura e movimento", screen.getByRole("dialog"));
    await save("Editar cadastro");
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === patient.id,
      )?.interests,
    ).toEqual(["Postura e movimento"]);
    expect(
      await screen.findByText("Postura e movimento", { exact: true }),
    ).toBeInTheDocument();
  });

  it.each(["service", "room", "professional"] as const)(
    "edits %s and keeps historical registry entries",
    async (kind) => {
      const { repository } = await setupApi();
      open("/configuracoes");
      fireEvent.click(
        await screen.findByRole("tab", { name: "Serviços e salas" }),
      );
      const section = screen.getByRole("tabpanel", {
        name: "Serviços e salas",
      });
      fireEvent.click(
        within(section).getByRole("tab", {
          name: {
            service: "Serviços",
            room: "Salas",
            professional: "Profissionais",
          }[kind],
        }),
      );
      const edit = await within(section).findAllByRole("button", {
        name: "Editar cadastro",
      });
      fireEvent.click(edit[0]!);
      const dialog = screen.getByRole("dialog", { name: "Editar cadastro" });
      change(
        kind === "professional" ? "Nome completo" : "Nome",
        "Cadastro revisado",
        dialog,
      );
      await save("Editar cadastro", "Salvar cadastro");
      const registry = await repository.getAdministrativeRegistry(clinicId);
      const entries =
        kind === "service"
          ? registry.services
          : kind === "room"
            ? registry.rooms
            : registry.professionals;
      expect(
        entries.some(
          (item) =>
            ("fullName" in item ? item.fullName : item.name) ===
            "Cadastro revisado",
        ),
      ).toBe(true);
    },
  );
});
