import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, save } from "../../test-support/workflow-ui";

const signInput = {
  signerName: "Marina Costa",
  accepted: true as const,
  signatureImage: "data:image/png;base64,iVBORw0KGgo=",
};

/** Duas parcelas pagas: uma com o recibo enviado, visto e assinado; outra sem envio. */
async function paidReceivables() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Marina Costa",
    phone: "11988887777",
    tags: [],
  });
  const receivable = (description: string) =>
    api.repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description,
      amountInCents: 16_000,
      dueDate: "2040-06-10",
      competence: "2040-06",
    });
  const signed = await receivable("Mensalidade assinada");
  const pending = await receivable("Mensalidade sem envio");
  for (const item of [signed, pending])
    await api.repository.settleReceivable(clinicId, actorId, item.id, "pix");
  const [receipt] = await api.repository.listReceiptSignatures(
    clinicId,
    signed.id,
  );
  await api.repository.markReceiptSignatureSent(clinicId, receipt!.id);
  await api.repository.openPublicReceiptSignature(receipt!.token, {});
  await api.repository.signPublicReceiptSignature(
    receipt!.token,
    signInput,
    {},
  );
  return api;
}

const rowOf = async (description: string) =>
  (await screen.findByText(description)).closest<HTMLElement>(".finance-row")!;

const moment = String.raw`\d{2} de [a-zç]+\.? às \d{2}:\d{2}`;

describe("controle do recibo enviado, visualizado e assinado", () => {
  it("mostra o selo e as datas na lista e filtra os recibos não assinados", async () => {
    await paidReceivables();
    open("/financeiro");
    const signed = await rowOf("Mensalidade assinada");
    expect(within(signed).getByText("Recibo assinado")).toBeInTheDocument();
    // A linha mostra só a etapa mais recente; as três datas ficam no título.
    const latest = within(signed).getByText(
      new RegExp(`^Assinado em ${moment}$`),
    );
    expect(latest.getAttribute("title")).toMatch(
      new RegExp(
        `^Enviado em ${moment}\\nVisualizado em ${moment}\\nAssinado em ${moment}$`,
      ),
    );
    expect(within(signed).queryByText(/^Enviado em/)).not.toBeInTheDocument();
    const pending = await rowOf("Mensalidade sem envio");
    expect(within(pending).getByText("Recibo não enviado")).toBeInTheDocument();
    expect(within(pending).queryByText(/^Enviado em/)).not.toBeInTheDocument();

    const filter = screen.getByRole("button", { name: /^Recibo não assinado/ });
    expect(filter).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(filter);
    expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Mensalidade sem envio")).toBeInTheDocument();
    expect(screen.queryByText("Mensalidade assinada")).not.toBeInTheDocument();
    // Combina com a situação: entre as parcelas em aberto não há recibo.
    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Filtrar parcelas por situação" }),
      ).getByRole("button", { name: /^Em aberto/ }),
    );
    expect(screen.queryByText("Mensalidade sem envio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(filter).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Mensalidade assinada")).toBeInTheDocument();
  });

  it("mostra enviado, visualizado e assinado no recibo da parcela", async () => {
    await paidReceivables();
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade assinada")).getByRole("button", {
        name: "Recibo",
      }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Recibo de pagamento",
    });
    let tracking = within(dialog).getByRole("region", {
      name: "Assinatura do recibo",
    });
    expect(within(tracking).getByText("Recibo assinado")).toBeInTheDocument();
    for (const label of ["Enviado em", "Visualizado em", "Assinado em"])
      expect(
        within(tracking).getByText(label).nextElementSibling?.textContent,
      ).toMatch(new RegExp(`^${moment}$`));
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));

    fireEvent.click(
      within(await rowOf("Mensalidade sem envio")).getByRole("button", {
        name: "Recibo",
      }),
    );
    dialog = await screen.findByRole("dialog", {
      name: "Recibo de pagamento",
    });
    tracking = within(dialog).getByRole("region", {
      name: "Assinatura do recibo",
    });
    expect(
      within(tracking).getByText("Recibo não enviado"),
    ).toBeInTheDocument();
    for (const label of ["Enviado em", "Visualizado em", "Assinado em"])
      expect(
        within(tracking).getByText(label).nextElementSibling,
      ).toHaveTextContent("Ainda não");
  });

  it("o envio pelo recibo da parcela atualiza o selo e as datas sem recarregar", async () => {
    await paidReceivables();
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade sem envio")).getByRole("button", {
        name: "Recibo",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Recibo de pagamento",
    });
    const tracking = within(dialog).getByRole("region", {
      name: "Assinatura do recibo",
    });
    expect(
      within(tracking).getByText("Recibo não enviado"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("link", {
        name: "Enviar recibo pelo WhatsApp",
      }),
    );
    expect(
      await within(tracking).findByText("Recibo enviado"),
    ).toBeInTheDocument();
    expect(
      within(tracking).getByText("Enviado em").nextElementSibling?.textContent,
    ).toMatch(new RegExp(`^${moment}$`));
    // O modal continua aberto, e a lista atrás dele também já mostra o envio.
    expect(dialog).toBeInTheDocument();
    const row = await rowOf("Mensalidade sem envio");
    expect(within(row).getByText("Recibo enviado")).toBeInTheDocument();
    expect(
      within(row).getByText(new RegExp(`^Enviado em ${moment}$`)),
    ).toBeInTheDocument();
  });

  it("o envio pelo aviso da baixa atualiza o selo e o filtro sem recarregar", async () => {
    const api = await setupApi();
    const patient = await api.repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Marina Costa",
      phone: "11988887777",
      tags: [],
    });
    await api.repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Mensalidade da baixa",
      amountInCents: 16_000,
      dueDate: "2040-06-10",
      competence: "2040-06",
    });
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade da baixa")).getByRole("button", {
        name: "Dar baixa",
      }),
    );
    await save("Dar baixa na parcela", "Confirmar baixa");
    const notice = await screen.findByRole("region", {
      name: "Recibo da baixa",
    });
    expect(
      within(await rowOf("Mensalidade da baixa")).getByText(
        "Recibo não enviado",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      within(notice).getByRole("link", {
        name: "Enviar recibo pelo WhatsApp",
      }),
    );
    const row = await rowOf("Mensalidade da baixa");
    expect(await within(row).findByText("Recibo enviado")).toBeInTheDocument();
    expect(
      within(row).getByText(new RegExp(`^Enviado em ${moment}$`)),
    ).toBeInTheDocument();
    // Enviado e ainda não assinado: continua no filtro "Recibo não assinado".
    fireEvent.click(
      screen.getByRole("button", { name: /^Recibo não assinado/ }),
    );
    expect(screen.getByText("Mensalidade da baixa")).toBeInTheDocument();
  });
});
