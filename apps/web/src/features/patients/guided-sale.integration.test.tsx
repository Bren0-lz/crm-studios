import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import { fillRequiredContact } from "../../test-support/patient-actions";
import { change, open } from "../../test-support/workflow-ui";
import { localIsoDate } from "../../shared/lib/formatting";

vi.mock("../contracts/document-pdf", () => ({
  generateDocumentPdf: vi.fn(
    async () => new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
  ),
}));

/** 1ª terça-feira a partir de daqui a 7 dias (AAAA-MM-DD local). */
function tuesday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 7);
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1);
  return localIsoDate(date);
}

/**
 * RC8: o cadastro de cliente vende o avulso com contrato e sessões; ao concluir, saem o link
 * do contrato, os horários pelo WhatsApp e a pergunta do pagamento, como no Novo plano.
 */
async function registerSingleWithContractAndSession() {
  const { repository } = await setupApi();
  installDocumentBrowserMocks();
  const [service] = await repository.listServices(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const single = await repository.createPlanTemplate(clinicId, actorId, {
    name: "Avulso com contrato",
    kind: "single",
    totalValueInCents: 9000,
    services: [
      { serviceId: service!.id, totalSessions: 1, totalValueInCents: 9000 },
    ],
  });
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato do avulso",
    kind: "consent",
    body: "Eu, {{paciente_nome}}, contrato a sessão avulsa do estúdio.",
  });
  open("/clientes");
  fireEvent.click(await screen.findByRole("button", { name: "Novo cliente" }));
  const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
  fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
    target: { value: "Bia Avulsa" },
  });
  fireEvent.change(within(dialog).getByLabelText("CPF"), {
    target: { value: nextTestCpf() },
  });
  fillRequiredContact(dialog);
  fireEvent.change(within(dialog).getAllByLabelText("Telefone")[0]!, {
    target: { value: "11987654321" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Adicionar serviço avulso" }),
  );
  const block = within(dialog).getByRole("group", { name: "Serviço avulso" });
  await within(block).findByRole("option", { name: new RegExp(single.name) });
  change("Plano cadastrado", single.id, block);
  await within(
    within(block).getByLabelText("Documento para o cliente assinar"),
  ).findByRole("option", { name: new RegExp(template.name) });
  change("Documento para o cliente assinar", template.id, block);
  // Avulso: a sessão sai dos dias fixos, como no Novo plano avulso.
  const schedule = await within(block).findByRole("group", {
    name: /1 sessão$/,
  });
  change("Profissional", professional!.id, schedule);
  change("Sala", room!.id, schedule);
  change("Primeira data", tuesday(), schedule);
  change("1º dia da semana", "2", schedule);
  change("Horário do 1º dia", "10:00", schedule);
  const summary = await within(block).findByRole("region", {
    name: "Resumo das sessões",
  });
  await waitFor(() =>
    expect(within(summary).getAllByRole("listitem")[0]).toHaveTextContent(
      "Livre",
    ),
  );
  const submit = within(dialog).getByRole("button", {
    name: "Salvar e criar serviço avulso",
  });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  return { repository, template };
}

describe("guided registration sale with contract and sessions (RC8)", () => {
  it("sends the contract and the schedule, then registers the payment and the receipt", async () => {
    const { repository, template } =
      await registerSingleWithContractAndSession();
    const contract = await screen.findByRole(
      "dialog",
      { name: "Enviar contrato" },
      { timeout: 10_000 },
    );
    expect(
      await within(contract).findByRole("link", { name: "Abrir WhatsApp" }),
    ).toBeInTheDocument();
    const [document] = await repository.listIssuedDocuments(clinicId);
    expect(document).toMatchObject({
      status: "issued",
      templateId: template.id,
    });
    expect(document!.planId).toBeTruthy();
    fireEvent.click(within(contract).getByRole("button", { name: "Concluir" }));
    // Horários do avulso pelo WhatsApp.
    const sessions = await screen.findByRole("dialog", {
      name: "Enviar horários",
    });
    expect(
      within(sessions).getByText("1 sessão agendada para Bia Avulsa."),
    ).toBeInTheDocument();
    const appointments = (
      await repository.listAppointments(
        clinicId,
        new Date(Date.now() - 86_400_000).toISOString(),
        new Date(Date.now() + 60 * 86_400_000).toISOString(),
      )
    ).filter((item) => item.planId === document!.planId);
    expect(appointments).toHaveLength(1);
    fireEvent.click(within(sessions).getByRole("button", { name: "Concluir" }));
    // Pagamento: "Sim" dá baixa e mostra o recibo para o WhatsApp.
    const payment = await screen.findByRole("dialog", {
      name: "Pagamento do plano",
    });
    expect(
      await within(payment).findByText(
        "O cliente já fez o pagamento (R$ 90,00)?",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(payment).getByRole("button", { name: "Sim, já pagou" }),
    );
    const settle = await screen.findByRole("dialog", {
      name: "Dar baixa na parcela",
    });
    fireEvent.click(
      within(settle).getByRole("button", { name: "Confirmar baixa" }),
    );
    expect(
      await within(payment).findByRole("link", {
        name: "Enviar recibo pelo WhatsApp",
      }),
    ).toBeInTheDocument();
    const receivable = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.find((item) => item.planId === document!.planId);
    expect(receivable).toMatchObject({ status: "paid" });
    fireEvent.click(within(payment).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Pagamento do plano" }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/Serviço avulso/)).toBeInTheDocument();
  });

  it("closes normally when the client has not paid yet", async () => {
    const { repository } = await registerSingleWithContractAndSession();
    const contract = await screen.findByRole(
      "dialog",
      { name: "Enviar contrato" },
      { timeout: 10_000 },
    );
    await within(contract).findByRole("link", { name: "Abrir WhatsApp" });
    fireEvent.click(within(contract).getByRole("button", { name: "Concluir" }));
    const sessions = await screen.findByRole("dialog", {
      name: "Enviar horários",
    });
    fireEvent.click(within(sessions).getByRole("button", { name: "Concluir" }));
    const payment = await screen.findByRole("dialog", {
      name: "Pagamento do plano",
    });
    fireEvent.click(
      await within(payment).findByRole("button", { name: "Não" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Pagamento do plano" }),
      ).not.toBeInTheDocument(),
    );
    const [document] = await repository.listIssuedDocuments(clinicId);
    const receivable = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.find((item) => item.planId === document!.planId);
    expect(receivable).toMatchObject({ status: "open" });
  });
});
