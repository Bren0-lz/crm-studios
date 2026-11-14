import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

describe("lean lead form", () => {
  it("creates a lead with name and phone and converts it with the client registration form prefilled", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const leads: Array<Record<string, unknown>> = [];
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        posts.push({ url, body });
        if (url.endsWith("/leads")) {
          const lead = {
            ...body,
            id: "44444444-4444-4444-8444-444444444444",
            clinicId: "11111111-1111-4111-8111-111111111111",
            stage: "new_contact",
            openTasks: 0,
            overdueTasks: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          leads.push(lead);
          return { ok: true, status: 201, json: async () => lead } as Response;
        }
        // LC1: a conversão usa o cadastro completo de cliente (cadastro guiado com o lead).
        if (url.endsWith("/patients/guided"))
          return {
            ok: true,
            status: 201,
            json: async () => ({
              lead: { ...leads[0], stage: "won", convertedPatientId: "p1" },
              patient: { id: "p1", fullName: "Lead Enxuto" },
            }),
          } as Response;
      }
      const body = isLeadBoardUrl(url) ? leadBoardResponse(url, leads) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Novo lead/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo lead" });
    expect(within(dialog).queryByLabelText(/CPF/)).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/emergência/i),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Endereço")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("CEP")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Mais informações")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Lead Enxuto" },
    });
    fireEvent.change(within(dialog).getByLabelText("Telefone"), {
      target: { value: "11977776666" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar ao funil" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({
      fullName: "Lead Enxuto",
      phone: "11977776666",
    });

    const card = (await screen.findByText("Lead Enxuto")).closest(
      "article",
    ) as HTMLElement;
    const createdNotice = await screen.findByRole("status");
    expect(createdNotice).toHaveTextContent("Lead Lead Enxuto cadastrado.");
    fireEvent.click(
      within(createdNotice).getByRole("button", { name: "Fechar aviso" }),
    );
    fireEvent.click(within(card).getByRole("button", { name: "Converter" }));
    // CV1: antes do formulário, a mensagem pede ao lead o que falta no cadastro.
    const request = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    const message = within(request).getByLabelText("Mensagem para o lead");
    expect(message).toHaveValue(
      "Olá, Lead! Para concluir seu cadastro, preciso destas informações:\n\n• CPF\n• E-mail\n• Data de nascimento\n• Endereço (CEP, rua, número, bairro, cidade/UF)\n• Contato de emergência (nome, telefone e WhatsApp)\n\nPode me enviar por aqui mesmo. Obrigado!",
    );
    expect(
      within(request).getByRole("link", { name: "Enviar pelo WhatsApp" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/wa\.me\/5511977776666\?text=Ol/),
    );
    fireEvent.click(
      within(request).getByRole("button", { name: "Preencher cadastro" }),
    );
    const convert = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    // LC1: mesmas opções do "Novo cliente" — plano, avulso, aula experimental e produtos.
    for (const option of [
      "Agendar aula experimental",
      "Adicionar plano",
      "Adicionar serviço avulso",
      "Adicionar produto",
    ])
      expect(
        within(convert).getByRole("button", { name: option }),
      ).toBeInTheDocument();
    // RT6: na conversão o botão fala em converter (no "Novo cliente", "Salvar e…").
    fireEvent.click(
      within(convert).getByRole("button", { name: "Adicionar plano" }),
    );
    expect(
      within(convert).getByRole("button", { name: "Converter e criar plano" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(convert).getByRole("button", { name: "Remover plano" }),
    );
    // Mesmo cadastro do "Novo cliente", já preenchido com o que o lead tem.
    expect(within(convert).getByLabelText("Nome completo")).toHaveValue(
      "Lead Enxuto",
    );
    const contact = within(convert).getByRole("group", { name: "Contato" });
    expect(within(contact).getByLabelText("Telefone")).toHaveValue(
      "(11) 97777-6666",
    );
    expect(within(convert).getByLabelText("E-mail")).toHaveValue("");
    expect(within(convert).getByLabelText("CPF")).toHaveValue("");
    fireEvent.change(within(convert).getByLabelText("CPF"), {
      target: { value: "529.982.247-25" },
    });
    // CD1: WhatsApp e contato de emergência obrigatórios na conversão.
    expect(
      within(convert).getByRole("button", { name: "Converter em cliente" }),
    ).toBeDisabled();
    expect(
      within(convert).getByText(
        "Falta: WhatsApp, Nome do contato de emergência, Telefone do contato de emergência, WhatsApp do contato de emergência.",
      ),
    ).toBeVisible();
    fireEvent.change(within(contact).getByLabelText("WhatsApp"), {
      target: { value: "11977776666" },
    });
    const emergency = within(convert).getByRole("group", {
      name: "Contato de emergência",
    });
    expect(within(emergency).getByLabelText("Nome")).toBeRequired();
    expect(within(emergency).getByLabelText("Telefone")).toBeRequired();
    expect(within(emergency).getByLabelText("WhatsApp")).toBeRequired();
    fireEvent.click(
      within(emergency).getByRole("button", {
        name: "Usar os dados do cliente",
      }),
    );
    expect(within(emergency).getByLabelText("Nome")).toHaveValue("Lead Enxuto");
    expect(within(emergency).getByLabelText("Telefone")).toHaveValue(
      "(11) 97777-6666",
    );
    expect(within(emergency).getByLabelText("WhatsApp")).toHaveValue(
      "(11) 97777-6666",
    );
    fireEvent.change(within(emergency).getByLabelText("Nome"), {
      target: { value: "Joana Mãe" },
    });
    fireEvent.change(within(convert).getByLabelText("Endereço"), {
      target: { value: "Rua das Flores, 10" },
    });
    fireEvent.click(
      within(convert).getByRole("button", { name: "Converter em cliente" }),
    );
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]!.url).toMatch(/\/patients\/guided$/);
    expect(posts[1]!.body).toMatchObject({
      next: "none",
      leadId: "44444444-4444-4444-8444-444444444444",
      patient: {
        fullName: "Lead Enxuto",
        phone: "11977776666",
        cpf: "52998224725",
        whatsapp: "11977776666",
        emergencyContactName: "Joana Mãe",
        emergencyContactPhone: "11977776666",
        emergencyContactWhatsapp: "11977776666",
        address: "Rua das Flores, 10",
      },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Converter lead em cliente" }),
      ).not.toBeInTheDocument(),
    );
    const won = screen.getByRole("region", { name: "Ganhos" });
    expect(within(won).getByText("Lead Enxuto")).toBeInTheDocument();
    expect(within(won).getByRole("banner")).toHaveTextContent("Ganhos1");
    expect(
      within(screen.getByRole("region", { name: "Novos" })).getByRole("banner"),
    ).toHaveTextContent("Novos0");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lead convertido: cadastro de Lead salvo.",
    );
  });

  // RT3: o cadastro de cliente exige o WhatsApp do contato de emergência.
  it("asks for the emergency contact WhatsApp when only its name and phone are filled", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const leads = [
      {
        id: "45454545-4545-4545-8545-454545454545",
        clinicId: "11111111-1111-4111-8111-111111111111",
        fullName: "Bia Emergência",
        phone: "11977775555",
        stage: "new_contact",
        cpf: "52998224725",
        email: "bia@email.com",
        birthDate: "1990-04-02",
        postalCode: "01001000",
        address: "Praça da Sé",
        addressNumber: "10",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        emergencyContactName: "João Souza",
        emergencyContactPhone: "11912345678",
      },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = isLeadBoardUrl(url) ? leadBoardResponse(url, leads) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Bia Emergência")).closest(
      "article",
    ) as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Converter" }));
    const request = screen.getByRole("dialog", {
      name: "Converter lead em cliente",
    });
    expect(
      within(request).getByLabelText("Mensagem para o lead"),
    ).toHaveValue(
      "Olá, Bia! Para concluir seu cadastro, preciso destas informações:\n\n• Contato de emergência (WhatsApp)\n\nPode me enviar por aqui mesmo. Obrigado!",
    );
  });
});
