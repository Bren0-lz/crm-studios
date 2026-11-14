import type { Lead } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadConvertModal } from "./LeadConvertModal";

const baseLead: Lead = {
  id: "lead-1",
  clinicId: "clinic-1",
  stage: "new",
  fullName: "Carla Mendes",
  phone: "11987654321",
  source: "Instagram",
  interest: "Pilates",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-11-01T12:00:00.000Z",
  updatedAt: "2026-11-01T12:00:00.000Z",
};

const completeLead: Lead = {
  ...baseLead,
  cpf: "52998224725",
  whatsapp: "11987654321",
  email: "carla@example.com",
  birthDate: "1991-05-20",
  postalCode: "01001000",
  address: "Praça da Sé",
  addressNumber: "10",
  neighborhood: "Sé",
  city: "São Paulo",
  state: "SP",
  emergencyContactName: "Paulo Mendes",
  emergencyContactPhone: "11912345678",
  emergencyContactWhatsapp: "11912345678",
};

// O cadastro em si é o `PatientModal` (LC1), coberto em lead-form-conversion.
function renderModal(lead: Lead) {
  return render(
    <LeadConvertModal lead={lead} onClose={vi.fn()}>
      <div role="dialog" aria-label="Converter lead em cliente">
        <label>
          CPF
          <input defaultValue={lead.cpf ?? ""} />
        </label>
        <button type="button">Converter em cliente</button>
      </div>
    </LeadConvertModal>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pedido de dados antes de converter o lead (CV1)", () => {
  it("mostra a mensagem com o que falta, copia e abre o WhatsApp do lead", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderModal({ ...completeLead, cpf: "", email: "" });
    const dialog = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    const message = within(dialog).getByLabelText("Mensagem para o lead");
    expect(message).toHaveValue(
      "Olá, Carla! Para concluir seu cadastro, preciso destas informações:\n\n• CPF\n• E-mail\n\nPode me enviar por aqui mesmo. Obrigado!",
    );
    fireEvent.change(message, {
      target: { value: "Oi, Carla! Me manda o CPF?" },
    });
    expect(
      within(dialog).getByRole("link", { name: "Enviar pelo WhatsApp" }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511987654321?text=${encodeURIComponent("Oi, Carla! Me manda o CPF?")}`,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Copiar mensagem" }),
    );
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Oi, Carla! Me manda o CPF?"),
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Preencher cadastro" }),
    );
    const form = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    expect(within(form).getByLabelText("CPF")).toHaveValue("");
    expect(
      within(form).getByRole("button", { name: "Converter em cliente" }),
    ).toBeInTheDocument();
  });

  it("mostra o erro quando o navegador não copia", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    renderModal(baseLead);
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A cópia não está disponível neste navegador.",
    );
  });

  it("vai direto ao formulário quando não falta nenhum dado", () => {
    renderModal(completeLead);
    expect(
      screen.queryByLabelText("Mensagem para o lead"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Converter em cliente" }),
    ).toBeInTheDocument();
  });
});
