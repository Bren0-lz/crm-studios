import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { patientInputSchema } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function paidReceipt() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: "Breno Pagante",
      phone: "11999991234",
      whatsapp: "11999991234",
      emergencyContactName: "Breno Pagante",
      emergencyContactPhone: "11999991234",
    }),
  );
  const receivable = await api.repository.createManualReceivable(
    clinicId,
    actorId,
    {
      patientId: patient.id,
      description: "Mensalidade de Pilates",
      amountInCents: 18_000,
      dueDate: "2039-06-10",
    },
  );
  await api.repository.settleReceivable(
    clinicId,
    actorId,
    receivable.id,
    "pix",
  );
  const [receipt] = await api.repository.listReceiptSignatures(
    clinicId,
    receivable.id,
  );
  // O cliente abre o link sem login.
  localStorage.clear();
  return { ...api, patient, receivable, receipt: receipt! };
}

function mockCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,cG5n",
  );
}

describe("link público do recibo", () => {
  it("o cliente confere o recibo sem login, assina e imprime com a assinatura e a data", async () => {
    const { repository, receivable, receipt } = await paidReceipt();
    mockCanvas();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    open(`/assinar-recibo/${receipt.token}`);

    expect(
      await screen.findByRole("heading", { name: "Recibo de pagamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Mensalidade de Pilates/)).toBeInTheDocument();
    expect(screen.getByText("Breno Pagante")).toBeInTheDocument();
    expect(screen.getByText("Pix")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Breno Pagante");

    const sign = screen.getByRole("button", { name: "Assinar recibo" });
    expect(sign).toBeDisabled();
    const pad = screen.getByRole("img", { name: "Área de assinatura" });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(pad);
    fireEvent.click(
      screen.getByLabelText(
        "Conferi o recibo e confirmo o pagamento descrito.",
      ),
    );
    await waitFor(() => expect(sign).toBeEnabled());
    fireEvent.click(sign);

    expect(
      await screen.findByText(/Recibo assinado por Breno Pagante em/),
    ).toBeInTheDocument();
    // A folha do recibo leva a assinatura desenhada e a data, para imprimir ou salvar em PDF.
    const signature = screen.getByRole("img", {
      name: "Assinatura de Breno Pagante",
    });
    expect(signature).toHaveAttribute("src", "data:image/png;base64,cG5n");
    expect(
      within(signature.closest("figure")!).getByText(
        /Assinado por Breno Pagante em/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assinar recibo" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Imprimir ou salvar PDF" }),
    );
    expect(print).toHaveBeenCalledTimes(1);

    const [stored] = await repository.listReceiptSignatures(
      clinicId,
      receivable.id,
    );
    expect(stored).toMatchObject({
      status: "signed",
      viewCount: 1,
      signerName: "Breno Pagante",
      signatureImage: "data:image/png;base64,cG5n",
    });
  });

  it("recibo já assinado abre direto no estado assinado", async () => {
    const { repository, receipt } = await paidReceipt();
    await repository.signPublicReceiptSignature(
      receipt.token,
      {
        signerName: "Breno Pagante",
        accepted: true,
        signatureImage: "data:image/png;base64,cG5n",
      },
      {},
    );
    open(`/assinar-recibo/${receipt.token}`);
    expect(
      await screen.findByText(/Recibo assinado por Breno Pagante em/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assinar recibo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Imprimir ou salvar PDF" }),
    ).toBeInTheDocument();
  });

  it("recibo cancelado pelo estorno avisa e não oferece a assinatura", async () => {
    const { repository, receivable, receipt } = await paidReceipt();
    await repository.reverseReceivablePayment(clinicId, actorId, receivable.id);
    open(`/assinar-recibo/${receipt.token}`);
    expect(
      await screen.findByText(
        /Este recibo foi cancelado pela clínica porque o pagamento foi estornado/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/R\$\s180,00 · pago em/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assinar recibo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Imprimir ou salvar PDF" }),
    ).not.toBeInTheDocument();
  });

  it("mostra o erro da assinatura recusada sem perder o formulário", async () => {
    const { repository, receivable, receipt } = await paidReceipt();
    mockCanvas();
    open(`/assinar-recibo/${receipt.token}`);
    await screen.findByRole("heading", { name: "Recibo de pagamento" });
    // Estornado enquanto o cliente estava com a página aberta.
    await repository.reverseReceivablePayment(clinicId, actorId, receivable.id);
    const pad = screen.getByRole("img", { name: "Área de assinatura" });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(pad);
    fireEvent.click(
      screen.getByLabelText(
        "Conferi o recibo e confirmo o pagamento descrito.",
      ),
    );
    const sign = screen.getByRole("button", { name: "Assinar recibo" });
    await waitFor(() => expect(sign).toBeEnabled());
    fireEvent.click(sign);
    expect(
      await screen.findByText(
        "Este recibo foi cancelado e não pode mais ser assinado.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Breno Pagante");
  });

  it("link desconhecido mostra mensagem amigável", async () => {
    await setupApi();
    localStorage.clear();
    open("/assinar-recibo/link-invalido");
    expect(await screen.findByText("Link indisponível")).toBeInTheDocument();
    expect(
      screen.getByText("Link do recibo não encontrado."),
    ).toBeInTheDocument();
  });
});
