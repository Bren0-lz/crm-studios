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
      within(dialog).getByRole("button", { name: "Salvar mensagem" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.url.includes(`/templates/${template.id}`))
          ?.body,
      ).toMatchObject({
        body: "Olá, {{nome}}! Temos turma nova.{{nome_completo}}",
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
      await within(results).findByText("3 clientes encontrados"),
    ).toBeInTheDocument();
    expect(within(results).getByText("Carla Souza")).toBeInTheDocument();
    expect(within(results).getByText("(21) 98888-7777")).toBeInTheDocument();
    expect(
      within(results).getByText("Não autorizou mensagens neste canal"),
    ).toBeInTheDocument();
    fireEvent.click(
      await within(
        within(dialog).getByRole("group", { name: "Com as etiquetas" }),
      ).findByRole("button", { name: /Pilates/ }),
    );
    expect(
      await within(results).findByText("2 clientes encontrados"),
    ).toBeInTheDocument();
    expect(within(results).queryByText("Carla Souza")).toBeNull();
    expect(previews.at(-1)).toMatchObject({
      audience: { mode: "segment", segment: { tags: ["Pilates"] } },
    });

    // Filtros novos: "Todas" as etiquetas, cidade, serviço, sumidos e repetição.
    fireEvent.click(within(dialog).getByRole("button", { name: "Todas" }));
    fireEvent.change(within(dialog).getByLabelText("Cidade"), {
      target: { value: "Campinas" },
    });
    fireEvent.click(within(dialog).getByText("Atendimentos e frequência"));
    fireEvent.click(
      within(
        within(dialog).getByRole("group", {
          name: "Fez algum destes serviços",
        }),
      ).getByRole("button", { name: /Dançaterapia/ }),
    );
    fireEvent.change(within(dialog).getByLabelText("Sumidos"), {
      target: { value: "60" },
    });
    fireEvent.click(within(dialog).getByText("Evitar repetição"));
    fireEvent.change(
      within(dialog).getByLabelText("Tirar quem já recebeu campanha"),
      { target: { value: "7" } },
    );
    expect(within(dialog).getByText("6 filtros ligados")).toBeInTheDocument();
    await waitFor(() =>
      expect(previews.at(-1)).toMatchObject({
        audience: {
          segment: {
            tags: ["Pilates"],
            tagMode: "all",
            city: "Campinas",
            serviceIds: ["s1"],
            absentDays: 60,
            excludeContactedDays: 7,
            status: "active",
          },
        },
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Limpar filtros" }),
    );
    expect(within(dialog).getByText("1 filtro ligado")).toBeInTheDocument();
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
});
