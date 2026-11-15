import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

const message = "Já existe um serviço com esse nome.";

async function openServices() {
  open("/configuracoes");
  fireEvent.click(await screen.findByRole("tab", { name: "Serviços e salas" }));
  return screen.getByRole("tabpanel", { name: "Serviços e salas" });
}

describe("serviço com nome repetido", () => {
  it("mostra o erro no formulário ao criar em Serviços e salas", async () => {
    const { repository } = await setupApi();
    await repository.createService(clinicId, {
      name: "TESTE Pilates",
      durationMinutes: 60,
    });
    const section = await openServices();
    fireEvent.click(
      await within(section).findByRole("button", { name: "Novo cadastro" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cadastro" });
    change("Nome", " teste pilates ", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cadastro" }),
    );
    const createError = await within(dialog).findByRole("alert");
    expect(createError).toHaveClass("form-error");
    expect(createError).toHaveTextContent(message);
    expect(
      (await repository.getAdministrativeRegistry(clinicId)).services.filter(
        (item) => item.name.trim().toLowerCase() === "teste pilates",
      ),
    ).toHaveLength(1);
  });

  it("mostra o erro no formulário ao renomear para o nome de outro serviço", async () => {
    const { repository } = await setupApi();
    await repository.createService(clinicId, {
      name: "TESTE Pilates",
      durationMinutes: 60,
    });
    await repository.createService(clinicId, {
      name: "TESTE Funcional",
      durationMinutes: 60,
    });
    const section = await openServices();
    const row = (
      await within(section).findByText("TESTE Funcional", { exact: true })
    ).closest(".table-row") as HTMLElement;
    fireEvent.click(
      within(row).getByRole("button", { name: "Editar cadastro" }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar cadastro" });
    change("Nome", "Teste Pilates", edit);
    fireEvent.click(
      within(edit).getByRole("button", { name: "Salvar cadastro" }),
    );
    const editError = await within(edit).findByRole("alert");
    expect(editError).toHaveClass("form-error");
    expect(editError).toHaveTextContent(message);
  });

  it("mostra o erro no cadastro rápido de serviço do plano", async () => {
    const { repository } = await setupApi();
    await repository.createService(clinicId, {
      name: "Reformer",
      durationMinutes: 50,
    });
    open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    fireEvent.focus(within(plan).getByRole("combobox", { name: "Serviço 1" }));
    fireEvent.click(within(plan).getByRole("button", { name: "Novo serviço" }));
    const quick = screen.getByRole("dialog", { name: "Novo serviço" });
    change("Nome do serviço", "reformér", quick);
    fireEvent.click(
      within(quick).getByRole("button", { name: "Cadastrar serviço" }),
    );
    const error = await within(quick).findByRole("alert");
    expect(error).toHaveClass("form-error");
    expect(error).toHaveTextContent(message);
  });
});
