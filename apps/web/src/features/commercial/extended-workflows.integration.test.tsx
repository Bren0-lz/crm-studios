import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "../../App";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";

function change(scope: HTMLElement, label: string, value: string) {
  for (const input of within(scope).getAllByLabelText(label, { exact: true }))
    fireEvent.change(input, { target: { value } });
}

describe("extended commercial workflows", () => {
  it("keeps the contact profile, combines funnel filters and records contact and task history", async () => {
    const { repository } = await setupApi();
    await repository.saveClinicCatalog(clinicId, actorId, "lead_source", {
      name: "Site",
      active: true,
    });
    await repository.saveClinicCatalog(clinicId, actorId, "interest", {
      name: "Pilates",
      active: true,
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Novo lead" }));
    const dialog = screen.getByRole("dialog", { name: "Novo lead" });
    fireEvent.click(
      within(dialog).getByText("Mais informações", { exact: true }),
    );
    await within(dialog).findByRole("option", { name: "Site" });
    await within(dialog).findByRole("option", { name: "Pilates" });
    for (const [label, value] of [
      ["Nome completo", "Lead com perfil completo"],
      ["Telefone", "11988887777"],
      ["E-mail", "lead@example.com"],
      ["WhatsApp", "11999998888"],
      ["Origem", "Site"],
      ["Interesse", "Pilates"],
      ["Forma de contato inicial", "WhatsApp"],
      ["Nascimento do interessado", "1990-05-01"],
      ["Profissão", "Professora"],
      ["Gênero", "female"],
      ["Tipo de cliente", "fixed"],
      ["Observações", "Preferência pelo período da manhã"],
      ["Responsável", actorId],
      ["Etiquetas", "Prioridade, Indicação"],
    ])
      change(dialog, label!, value!);
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Adicionar ao funil" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo lead" }),
      ).not.toBeInTheDocument(),
    );
    const lead = (await repository.listLeads(clinicId)).find(
      (item) => item.fullName === "Lead com perfil completo",
    )!;
    expect(lead).toMatchObject({
      birthDate: "1990-05-01",
      occupation: "Professora",
      clientType: "fixed",
      gender: "female",
      email: "lead@example.com",
      contactMethod: "WhatsApp",
      responsibleUserId: actorId,
      tags: ["Prioridade", "Indicação"],
    });
    fireEvent.click(
      screen.getByText("Filtros e análise do funil", { exact: true }),
    );
    const filters = screen
      .getByText("Filtros e análise do funil", { exact: true })
      .closest("section")!;
    for (const [label, value] of [
      ["Buscar no funil", "indicacao"],
      ["Filtrar etapa", "new_contact"],
      ["Filtrar origem", "Site"],
      ["Filtrar interesse", "Pilates"],
      ["Filtrar forma de contato", "WhatsApp"],
      ["Filtrar responsável", actorId],
      ["Filtrar tarefas", "none"],
      ["Filtrar histórico de contato", "without"],
    ])
      change(filters, label!, value!);
    // O funil é filtrado no servidor (com espera da digitação): a tela atualiza depois.
    expect(
      await screen.findByText(lead.fullName, { exact: true }),
    ).toBeInTheDocument();
    change(filters, "Buscar no funil", "inexistente");
    await waitFor(() =>
      expect(
        screen.queryByText(lead.fullName, { exact: true }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(
      within(filters).getByRole("button", { name: "Limpar filtros do funil" }),
    );
    const card = (
      await screen.findByText(lead.fullName, { exact: true })
    ).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Atividades" }));
    const activity = screen.getByRole("dialog");
    const task = await within(activity).findByLabelText("Tarefa");
    // Sem título, "Adicionar tarefa" fica desativado dizendo o que falta (QM14).
    fireEvent.change(task, { target: { value: " " } });
    const addTask = within(activity).getByRole("button", {
      name: "Adicionar tarefa",
    });
    expect(addTask).toBeDisabled();
    expect(addTask).toHaveAccessibleDescription("Falta: Tarefa.");
    fireEvent.change(task, { target: { value: "Retorno programado" } });
    expect(addTask).toBeEnabled();
    expect(within(activity).queryByText(/Falta:/)).not.toBeInTheDocument();
    change(activity, "Observações", "Confirmar disponibilidade");
    fireEvent.submit(task.closest("form")!);
    await within(activity).findByText("Retorno programado", { exact: true });
    fireEvent.click(within(activity).getByRole("button", { name: "Concluir" }));
    await within(activity).findByText("Concluída", { exact: true });
    fireEvent.click(
      within(activity).getByRole("button", { name: /^Contatos/ }),
    );
    change(activity, "Canal", "Presencial");
    change(activity, "Direção", "inbound");
    change(
      activity,
      "Registro do contato",
      "Cliente confirmou interesse em Pilates",
    );
    fireEvent.submit(
      within(activity)
        .getByRole("button", { name: "Registrar contato" })
        .closest("form")!,
    );
    await within(activity).findByText(
      "Cliente confirmou interesse em Pilates",
      { exact: true },
    );
    const history = await repository.getLeadActivity(clinicId, lead.id);
    expect(history?.tasks).toMatchObject([
      { title: "Retorno programado", status: "completed" },
    ]);
    expect(history?.contacts).toMatchObject([
      {
        channel: "in_person",
        direction: "inbound",
        contactMethod: "Presencial",
      },
    ]);
  });
});
