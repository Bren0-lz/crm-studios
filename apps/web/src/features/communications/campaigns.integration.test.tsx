import type {
  MessageTemplate,
  WhatsappCampaignDetail,
  WhatsappCampaignRecipient,
} from "@crm/contracts";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { appointmentPeriodPresets } from "./campaigns/model";
import {
  documentEditor,
  installDocumentBrowserMocks,
  setDocumentText,
} from "../../test-support/document-editor";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const now = new Date().toISOString();

const template: MessageTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Volta às aulas",
  body: "Olá, {{nome}}! Temos turma nova.",
  images: [],
  createdAt: now,
  updatedAt: now,
};

function recipient(
  overrides: Partial<WhatsappCampaignRecipient>,
): WhatsappCampaignRecipient {
  return {
    id: "r",
    patientId: "p",
    patientName: "Cliente",
    phone: "11999990000",
    message: "Olá!",
    status: "pending",
    ...overrides,
  };
}

function campaign(
  recipients: WhatsappCampaignRecipient[],
): WhatsappCampaignDetail {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "Outubro",
    templateId: template.id,
    templateTitle: template.title,
    body: template.body,
    images: [],
    total: recipients.length,
    sent: recipients.filter((item) => item.status === "sent").length,
    skipped: recipients.filter((item) => item.status === "skipped").length,
    createdAt: now,
    createdByName: "Aryana Dutra",
    recipients,
  };
}

type Handler = (url: string, init?: RequestInit) => unknown | undefined;

function setup(path: string, handler: Handler) {
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
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const body = handler(url, init) ?? [];
    return {
      ok: true,
      status: method === "POST" ? 201 : 200,
      json: async () => body,
    } as Response;
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return { calls };
}

describe("mensagens padrão", () => {
  it("insere o código do nome, mostra a prévia com o nome, anexa imagem e salva", async () => {
    const { calls } = setup("/comunicacoes?aba=mensagens", (url, init) => {
      if (url.endsWith("/communications/templates") && init?.method === "POST")
        return {
          ...template,
          ...JSON.parse(String(init.body)),
          images: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              fileName: "arte.png",
              mimeType: "image/png",
              sizeBytes: 68,
            },
          ],
        };
      if (url.includes("/communications/template-images/"))
        return {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          fileName: "arte.png",
          mimeType: "image/png",
          sizeBytes: 68,
          dataUrl: png,
        };
      return undefined;
    });
    await screen.findByText("Crie sua primeira mensagem padrão");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Mensagens padrão" }))
        .getAllByRole("button", { name: "Nova mensagem" })
        .at(-1)!,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova mensagem padrão",
    });
    fireEvent.change(within(dialog).getByLabelText("Título (só a equipe vê)"), {
      target: { value: "Volta às aulas" },
    });
    installDocumentBrowserMocks();
    const body = within(dialog).getByRole("textbox", { name: "Mensagem" });
    setDocumentText(body, "Olá, ");
    act(() => {
      documentEditor(body).commands.focus("end");
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Inserir nome" }),
    );
    // O código aparece como etiqueta verde, e não como `{{nome}}` cru.
    expect(body).toHaveTextContent("Olá, Nome");
    expect(within(body).getByText("Nome")).toHaveClass("document-field");
    const preview = within(dialog).getByRole("figure", {
      name: "Prévia no WhatsApp",
    });
    expect(within(preview).getByText("Olá, Maria")).toBeInTheDocument();

    const file = new File(
      [Uint8Array.from(atob(png.split(",")[1]!), (c) => c.charCodeAt(0))],
      "arte.png",
      { type: "image/png" },
    );
    fireEvent.change(within(dialog).getByLabelText("Escolher imagens"), {
      target: { files: [file, file, file, file] },
    });
    expect(
      await within(dialog).findByText("Cada mensagem pode ter até 3 imagens."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).getAllByRole("img", { name: "arte.png" }),
      ).toHaveLength(6),
    );
    // Com 3 imagens, a área para adicionar some.
    expect(
      within(dialog).queryByLabelText("Escolher imagens"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Remover arte.png" })[0]!,
    );
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Remover arte.png" })[0]!,
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar mensagem" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova mensagem padrão" }),
      ).not.toBeInTheDocument(),
    );
    const saved = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/communications/templates"),
    );
    expect(saved?.body).toEqual({
      title: "Volta às aulas",
      body: "Olá, {{nome}}",
      images: [{ fileName: "arte.png", dataUrl: png }],
    });
    expect(
      await screen.findByRole("heading", { name: "Volta às aulas" }),
    ).toBeInTheDocument();
  });
});

describe("editor da mensagem", () => {
  it("mostra os códigos da mensagem salva como etiquetas e salva o texto com os códigos", async () => {
    const { calls } = setup("/comunicacoes?aba=mensagens", (url, init) => {
      if (url.endsWith("/communications/templates")) return [template];
      if (init?.method === "PATCH" || init?.method === "PUT")
        return { ...template, ...JSON.parse(String(init.body)) };
      return undefined;
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Mais ações da mensagem Volta às aulas",
      }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Editar mensagem padrão",
    });
    installDocumentBrowserMocks();
    const body = within(dialog).getByRole("textbox", { name: "Mensagem" });
    expect(body).toHaveTextContent("Olá, Nome! Temos turma nova.");
    expect(within(body).getByText("Nome")).toHaveAttribute(
      "data-message-variable",
      "{{nome}}",
    );
    act(() => {
      documentEditor(body).commands.focus("end");
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Inserir nome completo" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Inserir hora do atendimento",
      }),
    );
    // Os códigos entram separados do texto e entre si por espaço (antes saía
    // "nova.Maria Souza09:00"); a prévia preenche a hora com o exemplo.
    expect(dialog.querySelector(".template-editor-preview")).toHaveTextContent(
      "Olá, Maria! Temos turma nova. Maria Souza 09:00",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar mensagem" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.url.includes(`/templates/${template.id}`))
          ?.body,
      ).toMatchObject({
        body: "Olá, {{nome}}! Temos turma nova. {{nome_completo}} {{hora_atendimento}}",
      }),
    );
  });
});

describe("cartões das mensagens padrão", () => {
  it("mostra a prévia do texto, as pílulas e o atalho de nova mensagem", async () => {
    const withImage: MessageTemplate = {
      ...template,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Com arte",
      body: "Promoção de verão",
      images: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          fileName: "arte.png",
          mimeType: "image/png",
          sizeBytes: 68,
        },
      ],
    };
    setup("/comunicacoes?aba=mensagens", (url) => {
      if (url.endsWith("/communications/templates"))
        return [template, withImage];
      if (url.includes("/communications/template-images/"))
        return { ...withImage.images[0], dataUrl: png };
      return undefined;
    });
    const textCard = (
      await screen.findByRole("heading", { name: "Volta às aulas" })
    ).closest("article")!;
    expect(within(textCard).getByText("Personalizada")).toBeInTheDocument();
    expect(within(textCard).getByText("Nome")).toHaveClass("message-code");
    const imageCard = screen
      .getByRole("heading", { name: "Com arte" })
      .closest("article")!;
    expect(within(imageCard).getByText("1 imagem")).toBeInTheDocument();
    expect(within(imageCard).queryByText("Personalizada")).toBeNull();
    await waitFor(() =>
      expect(imageCard.querySelector("img")).toHaveAttribute("src", png),
    );
    expect(screen.getByText("2 ativas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Texto com o nome/ }));
    expect(
      await screen.findByRole("dialog", { name: "Nova mensagem padrão" }),
    ).toBeInTheDocument();
  });
});

describe("campanhas de WhatsApp", () => {
  it("cria a campanha escolhendo clientes e abre o envio", async () => {
    const created = campaign([
      recipient({
        id: "r1",
        patientId: "p1",
        patientName: "Ana Lima",
        message: "Olá, Ana! Temos turma nova.",
      }),
    ]);
    const { calls } = setup("/comunicacoes", (url, init) => {
      if (url.includes("/communications/campaigns/preview"))
        return {
          matched: 2,
          recipients: 1,
          included: [
            { patientId: "p1", patientName: "Ana Lima", phone: "11999990000" },
          ],
          skipped: [
            {
              patientId: "p2",
              patientName: "Bruno Costa",
              reason: "opt_out",
            },
          ],
          sample: {
            patientName: "Ana Lima",
            message: "Olá, Ana! Temos turma nova.",
          },
        };
      if (url.endsWith("/communications/campaigns") && init?.method === "POST")
        return created;
      if (url.includes(`/communications/campaigns/${created.id}`))
        return created;
      if (url.endsWith("/communications/campaigns")) return [];
      if (url.endsWith("/communications/templates")) return [template];
      if (url.includes("/patients/options"))
        return url.includes("search=")
          ? [
              { id: "p1", fullName: "Ana Lima", tags: [] },
              { id: "p2", fullName: "Bruno Costa", tags: [] },
            ]
          : [];
      return undefined;
    });
    await screen.findByText("Nenhuma campanha ainda");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Nova campanha" }).at(0)!,
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova campanha" });
    expect(within(dialog).getByRole("radio")).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    const confer = within(dialog).getByRole("button", {
      name: "Conferir quem recebe",
    });
    expect(confer).toBeDisabled();
    const picker = within(dialog).getByRole("combobox");
    for (const name of ["Ana", "Bruno"]) {
      fireEvent.change(picker, { target: { value: name } });
      fireEvent.click(
        await within(dialog).findByRole("option", {
          name: new RegExp(name === "Ana" ? "Ana Lima" : "Bruno Costa"),
        }),
      );
    }
    expect(
      within(
        within(dialog).getByRole("list", { name: "Clientes escolhidos" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);
    fireEvent.click(confer);
    expect(
      await within(dialog).findByText("Ver quem foi pulado"),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Olá, Ana! Temos turma nova."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar e começar a enviar" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Outubro", level: 1 }),
    ).toBeInTheDocument();
    const create = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/communications/campaigns"),
    );
    expect(create?.body).toMatchObject({
      templateId: template.id,
      audience: { mode: "patients", patientIds: ["p1", "p2"] },
    });
  });

  it("cria campanha promocional com data final e mostra a promoção no envio", async () => {
    const created = {
      ...campaign([
        recipient({
          id: "r1",
          patientId: "p1",
          patientName: "Ana Lima",
          message: "Olá, Ana! Temos turma nova.",
        }),
      ]),
      promotion: { validUntil: "2099-12-31" },
    };
    const { calls } = setup("/comunicacoes", (url, init) => {
      if (url.includes("/communications/campaigns/preview"))
        return {
          matched: 1,
          recipients: 1,
          included: [
            { patientId: "p1", patientName: "Ana Lima", phone: "11999990000" },
          ],
          skipped: [],
          sample: {
            patientName: "Ana Lima",
            message: "Olá, Ana! Temos turma nova.",
          },
        };
      if (url.endsWith("/communications/campaigns") && init?.method === "POST")
        return created;
      if (url.includes(`/communications/campaigns/${created.id}`))
        return created;
      if (url.endsWith("/communications/campaigns")) return [];
      if (url.endsWith("/communications/templates")) return [template];
      if (url.includes("/patients/options"))
        return url.includes("search=")
          ? [{ id: "p1", fullName: "Ana Lima", tags: [] }]
          : [];
      return undefined;
    });
    await screen.findByText("Nenhuma campanha ainda");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Nova campanha" }).at(0)!,
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova campanha" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    fireEvent.change(within(dialog).getByRole("combobox"), {
      target: { value: "Ana" },
    });
    fireEvent.click(
      await within(dialog).findByRole("option", { name: /Ana Lima/ }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Conferir quem recebe" }),
    );
    const promotional = await within(dialog).findByRole("checkbox", {
      name: /Campanha promocional/,
    });
    const submit = within(dialog).getByRole("button", {
      name: "Criar e começar a enviar",
    });
    fireEvent.click(promotional);
    expect(
      within(dialog).getByLabelText(/Validade da promoção \(dias/),
    ).toHaveValue(7);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Até uma data" }),
    );
    // Sem a data final, ainda não dá para criar.
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Promoção válida até/), {
      target: { value: "2099-12-31" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(
      await screen.findByText(/Promocional \(válida até 31 de dez/),
    ).toBeInTheDocument();
    const create = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/communications/campaigns"),
    );
    expect(create?.body).toMatchObject({
      promotion: { validUntil: "2099-12-31" },
    });
  });

  it("por filtros, manda só para leads da etapa escolhida", async () => {
    const previews: Array<{ audience: Record<string, unknown> }> = [];
    setup("/comunicacoes", (url, init) => {
      if (url.includes("/communications/campaigns/preview")) {
        const body = JSON.parse(String(init?.body));
        previews.push(body);
        // Clientes e leads: um cliente e um lead.
        const both = body.audience?.audience === "patients_and_leads";
        return {
          matched: both ? 2 : 1,
          recipients: both ? 2 : 1,
          leads: 1,
          included: [
            { leadId: "l1", patientName: "Lia Lead", phone: "11977776666" },
            ...(both
              ? [
                  {
                    patientId: "p1",
                    patientName: "Caio Cliente",
                    phone: "11977775555",
                  },
                ]
              : []),
          ],
          skipped: [],
        };
      }
      if (url.endsWith("/communications/campaigns")) return [];
      if (url.endsWith("/communications/templates")) return [template];
      if (url.includes("/campaigns/filter-options"))
        return {
          services: [],
          professionals: [],
          cities: [],
          neighborhoods: [],
          sources: [],
          occupations: [],
          interests: [],
          levels: [],
          finance: true,
          leads: {
            stages: [
              { stage: "new_contact", label: "Novo contato" },
              { stage: "proposal", label: "Proposta" },
            ],
            sources: ["Instagram"],
            interests: [],
            tags: [],
            responsibles: [],
          },
        };
      return undefined;
    });
    await screen.findByText("Nenhuma campanha ainda");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Nova campanha" }).at(0)!,
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova campanha" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Por filtros" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Só leads" }));
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Proposta" }),
    );
    // Só leads: os filtros de cliente saem da tela.
    expect(
      within(dialog).queryByRole("button", { name: /^Filtros/ }),
    ).toBeNull();
    await waitFor(() =>
      expect(previews.at(-1)).toMatchObject({
        audience: {
          mode: "segment",
          audience: "leads",
          leadFilter: { stages: ["proposal"] },
        },
      }),
    );
    // RT4: o resumo fala em leads, sem "cliente" e sem repetir "· 1 lead".
    const results = within(dialog).getByRole("region", {
      name: "Leads encontrados",
    });
    expect(await within(results).findByText("Lia Lead")).toBeInTheDocument();
    const total = within(results).getByRole("status");
    expect(total).toHaveTextContent("lead vai receber esta campanha");
    expect(total).toHaveTextContent("1 lead encontrado");
    expect(total).not.toHaveTextContent(/cliente/i);
    expect(total).not.toHaveTextContent("· 1 lead");
    // Sem etiqueta em nenhum lead, o filtro aparece com o aviso.
    expect(within(dialog).getByText("Etiquetas do lead")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Nenhum lead tem etiqueta ainda."),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Clientes e leads" }),
    );
    const both = await within(dialog).findByRole("region", {
      name: "Pessoas encontradas",
    });
    expect(
      await within(both).findByText("pessoas vão receber esta campanha"),
    ).toBeInTheDocument();
    expect(within(both).getByRole("status")).toHaveTextContent(
      "2 pessoas encontradas · 1 lead",
    );
  });

  it("por filtros, lista na hora quem a etiqueta encontrou", async () => {
    const previews: unknown[] = [];
    setup("/comunicacoes", (url, init) => {
      if (url.includes("/communications/campaigns/preview")) {
        const body = JSON.parse(String(init?.body));
        previews.push(body);
        const tagged = body.audience.segment.tags.includes("Pilates");
        return {
          matched: tagged ? 2 : 3,
          recipients: tagged ? 1 : 2,
          included: [
            { patientId: "p1", patientName: "Ana Lima", phone: "11999990000" },
            ...(tagged
              ? []
              : [
                  {
                    patientId: "p3",
                    patientName: "Carla Souza",
                    phone: "21988887777",
                  },
                ]),
          ],
          skipped: [
            { patientId: "p2", patientName: "Bruno Costa", reason: "opt_out" },
          ],
        };
      }
      if (url.endsWith("/communications/campaigns")) return [];
      if (url.endsWith("/communications/templates")) return [template];
      if (url.includes("/patient-tags"))
        return [{ id: "t1", name: "Pilates", color: "#184f43" }];
      if (url.includes("/campaigns/filter-options"))
        return {
          services: [{ id: "s1", name: "Dançaterapia" }],
          professionals: [{ id: "pr1", name: "Clara Souza" }],
          cities: ["Campinas", "São Paulo"],
          neighborhoods: [],
          sources: [],
          occupations: [],
          interests: [],
          levels: [],
          finance: true,
        };
      return undefined;
    });
    await screen.findByText("Nenhuma campanha ainda");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Nova campanha" }).at(0)!,
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova campanha" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Por filtros" }),
    );
    const results = within(dialog).getByRole("region", {
      name: "Clientes encontrados",
    });
    expect(
      await within(results).findByText("clientes vão receber esta campanha"),
    ).toBeInTheDocument();
    expect(
      within(results).getByText(/3 clientes encontrados · 1 será pulado/),
    ).toBeInTheDocument();
    expect(within(results).getByText("Carla Souza")).toBeInTheDocument();
    expect(within(results).getByText("(21) 98888-7777")).toBeInTheDocument();
    // A lista mostra só quem vai receber; os pulados ficam só na contagem.
    expect(within(results).queryByText("Bruno Costa")).toBeNull();
    expect(
      within(results).queryByText("Não autorizou mensagens neste canal"),
    ).toBeNull();
    // Os filtros ficam num modal próprio, sobre a "Nova campanha".
    fireEvent.click(within(dialog).getByRole("button", { name: /^Filtros/ }));
    let filters = await screen.findByRole("dialog", {
      name: "Filtros da campanha",
    });
    fireEvent.click(
      await within(
        within(filters).getByRole("group", { name: "Com as etiquetas" }),
      ).findByRole("button", { name: /Pilates/ }),
    );
    await waitFor(() =>
      expect(within(filters).getByRole("status").textContent).toBe(
        "1 cliente vai receber",
      ),
    );
    // Só aplica ao confirmar: a lista da campanha ainda tem a Carla.
    expect(within(results).getByText("Carla Souza")).toBeInTheDocument();
    fireEvent.click(
      within(filters).getByRole("button", { name: "Aplicar filtros" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Filtros da campanha" }),
    ).toBeNull();
    expect(
      await within(results).findByText(/2 clientes encontrados/),
    ).toBeInTheDocument();
    expect(within(results).queryByText("Carla Souza")).toBeNull();
    expect(previews.at(-1)).toMatchObject({
      audience: { mode: "segment", segment: { tags: ["Pilates"] } },
    });
    expect(
      within(
        within(dialog).getByRole("list", { name: "Filtros ligados" }),
      ).getByText("Etiquetas"),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Filtros/ }));
    filters = await screen.findByRole("dialog", {
      name: "Filtros da campanha",
    });

    // Filtros novos: "Todas" as etiquetas, cidade, serviço, sumidos, dia do
    // atendimento (lembrete) e repetição.
    fireEvent.click(within(filters).getByRole("button", { name: "Todas" }));
    fireEvent.change(within(filters).getByLabelText("Cidade"), {
      target: { value: "Campinas" },
    });
    fireEvent.click(within(filters).getByText("Atendimentos e frequência"));
    fireEvent.click(
      within(
        within(filters).getByRole("group", {
          name: "Fez algum destes serviços",
        }),
      ).getByRole("button", { name: /Dançaterapia/ }),
    );
    fireEvent.change(within(filters).getByLabelText("Sumidos"), {
      target: { value: "60" },
    });
    fireEvent.change(within(filters).getByLabelText("Até"), {
      target: { value: "2026-10-31" },
    });
    fireEvent.change(within(filters).getByLabelText("De"), {
      target: { value: "2026-10-25" },
    });
    fireEvent.change(within(filters).getByLabelText("Quais atendimentos"), {
      target: { value: "any" },
    });
    fireEvent.click(within(filters).getByText("Evitar repetição"));
    fireEvent.change(
      within(filters).getByLabelText("Tirar quem já recebeu campanha"),
      { target: { value: "7" } },
    );
    expect(within(filters).getByText("7 filtros ligados")).toBeInTheDocument();
    await waitFor(() =>
      expect(previews.at(-1)).toMatchObject({
        audience: {
          segment: {
            tags: ["Pilates"],
            tagMode: "all",
            city: "Campinas",
            serviceIds: ["s1"],
            absentDays: 60,
            appointmentFrom: "2026-10-25",
            appointmentTo: "2026-10-31",
            appointmentStatus: "any",
            excludeContactedDays: 7,
            status: "active",
          },
        },
      }),
    );
    fireEvent.click(
      within(filters).getByRole("button", { name: "Aplicar filtros" }),
    );
    expect(
      within(dialog).getByRole("button", { name: /^Filtros/ }),
    ).toHaveTextContent("Filtros7");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Limpar filtros" }),
    );
    expect(
      within(dialog).getByRole("button", { name: /^Filtros/ }),
    ).toHaveTextContent("Filtros1");
  });

  it("abre o WhatsApp com o texto pronto e, ao voltar, registra o envio e passa ao próximo", async () => {
    const detail = campaign([
      recipient({
        id: "r1",
        patientId: "p1",
        patientName: "Ana Lima",
        phone: "11999990000",
        message: "Olá, Ana!",
      }),
      recipient({
        id: "r2",
        patientId: "p2",
        patientName: "Bruno Costa",
        phone: "21988887777",
        message: "Olá, Bruno!",
      }),
    ]);
    const { calls } = setup(
      `/comunicacoes/campanhas/${detail.id}`,
      (url, init) => {
        if (url.includes("/recipients/r1")) {
          const sent = {
            ...detail.recipients[0]!,
            status: "sent" as const,
            handledAt: now,
            handledByName: "Aryana Dutra",
          };
          return {
            campaign: { ...detail, sent: 1 },
            recipient: sent,
          };
        }
        if (
          url.includes(`/communications/campaigns/${detail.id}`) &&
          !init?.method
        )
          return detail;
        return undefined;
      },
    );
    expect(
      await screen.findByRole("heading", { name: "Ana Lima" }),
    ).toBeInTheDocument();
    const open = screen.getByRole("link", {
      name: "Abrir conversa no WhatsApp",
    });
    expect(open).toHaveAttribute(
      "href",
      `https://wa.me/5511999990000?text=${encodeURIComponent("Olá, Ana!")}`,
    );
    expect(open).toHaveAttribute("target", "_blank");
    fireEvent.click(open);
    document.dispatchEvent(new Event("visibilitychange"));
    const dialog = await screen.findByRole("dialog", {
      name: "Enviou para Ana Lima?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Sim, enviada" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Bruno Costa" }),
    ).toBeInTheDocument();
    expect(
      calls.find((call) => call.url.includes("/recipients/r1"))?.body,
    ).toEqual({ status: "sent" });
    expect(
      screen.getByRole("link", { name: "Abrir conversa no WhatsApp" }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5521988887777?text=${encodeURIComponent("Olá, Bruno!")}`,
    );
  });

  it("com uma imagem, o mesmo clique copia a imagem e abre a conversa", async () => {
    const image = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fileName: "arte.png",
      mimeType: "image/png",
      sizeBytes: 68,
    };
    const detail = {
      ...campaign([
        recipient({ id: "r1", patientName: "Ana Lima", message: "Olá, Ana!" }),
      ]),
      images: [image],
    };
    const write = vi.fn().mockResolvedValue(undefined);
    // O conteúdo da imagem chega como promessa; aqui só importa que a cópia foi pedida.
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: class {
        constructor(items: Record<string, Promise<Blob>>) {
          Object.values(items).forEach((item) => void item.catch(() => {}));
        }
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText: vi.fn() },
    });
    try {
      setup(`/comunicacoes/campanhas/${detail.id}`, (url, init) => {
        if (url.includes("/communications/template-images/"))
          return { ...image, dataUrl: png };
        if (
          url.includes(`/communications/campaigns/${detail.id}`) &&
          !init?.method
        )
          return detail;
        return undefined;
      });
      const open = await screen.findByRole("link", {
        name: "Copiar imagem e abrir conversa",
      });
      expect(screen.queryByText("Copie a imagem")).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Abrir conversa no WhatsApp" }),
      ).toBeNull();
      expect(open).toHaveAttribute(
        "href",
        `https://wa.me/5511999990000?text=${encodeURIComponent("Olá, Ana!")}`,
      );
      fireEvent.click(open);
      expect(write).toHaveBeenCalledTimes(1);
      document.dispatchEvent(new Event("visibilitychange"));
      expect(
        await screen.findByRole("dialog", { name: "Enviou para Ana Lima?" }),
      ).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(globalThis, "ClipboardItem");
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("atalhos do período de atendimento", () => {
  it("calcula hoje, amanhã, semana e meses a partir do dia", () => {
    expect(appointmentPeriodPresets("2026-01-31")).toEqual([
      { label: "Hoje", from: "2026-01-31", to: "2026-01-31" },
      { label: "Amanhã", from: "2026-02-01", to: "2026-02-01" },
      { label: "Próximos 7 dias", from: "2026-01-31", to: "2026-02-06" },
      { label: "Este mês", from: "2026-01-01", to: "2026-01-31" },
      { label: "Mês passado", from: "2025-12-01", to: "2025-12-31" },
      { label: "Últimos 30 dias", from: "2026-01-02", to: "2026-01-31" },
    ]);
  });
});
