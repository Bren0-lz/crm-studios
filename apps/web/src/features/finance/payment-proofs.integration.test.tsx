import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { change, open, save } from "../../test-support/workflow-ui";

const pdf = new File(["%PDF-1.4\nComprovante\n%%EOF"], "pix.pdf", {
  type: "application/pdf",
});
const png = new File(
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
  "foto.png",
  { type: "image/png" },
);
const invalid = new File(["texto"], "nota.txt", { type: "text/plain" });

describe("comprovantes de pagamento", () => {
  it("anexa vários comprovantes no fim do pagamento e os mostra depois", async () => {
    const { repository } = await setupApi();
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Aluguel",
      kind: "expense",
    });
    const payable = await repository.createPayable(clinicId, actorId, {
      description: "Aluguel da sala",
      supplier: "Imobiliária",
      categoryId: category.id,
      dueDate: "2040-06-10",
      amountInCents: 4000,
      notes: "",
    });
    open("/financeiro");
    fireEvent.click(
      await screen.findByRole("button", { name: /^Contas a pagar \(/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Pagar Aluguel da sala" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Pagar despesa" });
    const input = within(dialog).getByLabelText(
      "Adicionar comprovantes (opcional)",
    );
    fireEvent.change(input, { target: { files: [pdf, invalid] } });
    expect(
      within(dialog).getByText(
        "Use comprovantes PDF, PNG ou JPEG de até 5 MB.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [png] } });
    const selected = within(dialog).getByRole("list", {
      name: "Comprovantes selecionados",
    });
    expect(within(selected).getByText("pix.pdf")).toBeInTheDocument();
    expect(within(selected).getByText("foto.png")).toBeInTheDocument();
    expect(within(selected).queryByText("nota.txt")).not.toBeInTheDocument();
    await save("Pagar despesa", "Confirmar pagamento");
    await waitFor(async () =>
      expect(
        (
          await repository.listPaymentProofs(clinicId, "payable", payable.id)
        ).map((proof) => proof.fileName),
      ).toEqual(["pix.pdf", "foto.png"]),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comprovantes de Aluguel da sala",
      }),
    );
    const proofs = await screen.findByRole("dialog", { name: "Comprovantes" });
    const list = await within(proofs).findByRole("list", {
      name: "Comprovantes anexados",
    });
    expect(within(list).getByText("pix.pdf")).toBeInTheDocument();
    expect(within(list).getByText("foto.png")).toBeInTheDocument();
    expect(
      within(proofs).getByRole("button", { name: "Baixar foto.png" }),
    ).toBeEnabled();
  });

  it("dá baixa no cartão em 3x com comprovante, exclui o errado e guarda o da baixa estornada", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente Cartão",
      phone: "11988887777",
      tags: [],
    });
    const receivable = await repository.createManualReceivable(
      clinicId,
      actorId,
      {
        patientId: patient.id,
        description: "Mensalidade no cartão",
        amountInCents: 30000,
        dueDate: "2040-06-10",
      },
    );
    open("/financeiro");
    const row = () =>
      screen
        .getAllByText("Mensalidade no cartão")[0]!
        .closest(".finance-row") as HTMLElement;
    await screen.findAllByText("Mensalidade no cartão");
    fireEvent.click(within(row()).getByRole("button", { name: "Dar baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
    // Ordem do modal: forma → parcelamento na forma → valores → comprovantes no fim.
    change("Forma de pagamento recebida", "card", dialog);
    const installments = await within(dialog).findByLabelText(/^Parcelamento/);
    fireEvent.change(installments, { target: { value: "3" } });
    const fields = [
      ...dialog.querySelectorAll("select, input, fieldset legend"),
    ].map((node) => node.getAttribute("aria-label") ?? node.textContent);
    expect(fields.indexOf("Comprovantes")).toBeGreaterThan(
      fields.indexOf("Valor recebido"),
    );
    fireEvent.change(
      within(dialog).getByLabelText("Adicionar comprovantes (opcional)"),
      { target: { files: [pdf] } },
    );
    await save("Dar baixa na parcela", "Confirmar baixa");
    await waitFor(() =>
      expect(within(row()).getByText(/Pago: .* · 3x/)).toBeInTheDocument(),
    );

    // Comprovante errado: excluído com motivo.
    fireEvent.click(
      within(row()).getByRole("button", {
        name: "Comprovantes de Mensalidade no cartão",
      }),
    );
    let proofs = await screen.findByRole("dialog", { name: "Comprovantes" });
    fireEvent.click(
      await within(proofs).findByRole("button", { name: "Excluir pix.pdf" }),
    );
    const confirm = screen.getByRole("dialog", { name: "Excluir comprovante" });
    change("Motivo", "Comprovante de outro cliente", confirm);
    await save("Excluir comprovante", "Excluir comprovante");
    await within(proofs).findByText("Nenhum comprovante anexado");
    expect(
      await repository.listPaymentProofs(clinicId, "receivable", receivable.id),
    ).toEqual([]);
    fireEvent.click(
      within(proofs).getAllByRole("button", { name: "Fechar" }).at(-1)!,
    );

    // Estorno: o comprovante fica no histórico como da baixa estornada.
    const content = Buffer.from("%PDF-1.4\nCerto\n%%EOF");
    await repository.createPaymentProof(
      clinicId,
      actorId,
      "receivable",
      receivable.id,
      {
        fileName: "certo.pdf",
        mimeType: "application/pdf",
        sizeInBytes: content.length,
        contentBase64: content.toString("base64"),
      },
    );
    fireEvent.click(within(row()).getByRole("button", { name: "Estornar" }));
    await within(row()).findByRole("button", { name: "Dar baixa" });
    fireEvent.click(within(row()).getByRole("button", { name: "Dar baixa" }));
    await save("Dar baixa na parcela", "Confirmar baixa");
    fireEvent.click(
      await within(row()).findByRole("button", {
        name: "Comprovantes de Mensalidade no cartão",
      }),
    );
    proofs = await screen.findByRole("dialog", { name: "Comprovantes" });
    const history = await within(proofs).findByRole("list", {
      name: "Comprovantes da baixa estornada",
    });
    expect(within(history).getByText("certo.pdf")).toBeInTheDocument();
    expect(within(history).getByText(/baixa estornada em/)).toBeInTheDocument();
  });
});
