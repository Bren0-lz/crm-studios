import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

const secret = "segredo-do-webhook-de-teste-1234";

function fakeTelegram() {
  const sent: { chatId: string; text: string }[] = [];
  return {
    sent,
    integration: {
      webhookSecret: secret,
      client: {
        async sendMessage(chatId: string, text: string) {
          sent.push({ chatId, text });
        },
      },
    },
  };
}

async function openIntegrations() {
  open("/configuracoes?secao=integracoes&integracao=telegram");
  const panel = await screen.findByRole("tabpanel", { name: "Integrações" });
  return within(panel).findByRole("region", { name: "Telegram" });
}

/** Simula o relógio depois do prazo do código (10 minutos). */
function afterCodeExpires() {
  const later = Date.now() + 11 * 60_000;
  vi.spyOn(Date, "now").mockReturnValue(later);
}

describe("Telegram em Configurações › Integrações", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("avisa que a integração está desligada sem o token do bot", async () => {
    await setupApi({ telegram: null });
    open("/configuracoes?secao=integracoes");
    const sections = await screen.findByRole("navigation", {
      name: "Páginas de integrações",
    });
    expect(
      within(sections).getByRole("link", { name: "Chaves de API" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(sections).getByRole("link", { name: "Telegram" }));
    const section = await screen.findByRole("region", { name: "Telegram" });
    await within(section).findByText("Integração desligada");
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("region", { name: "Chaves de API" })).toBeNull();
    expect(
      within(section).queryByRole("button", { name: "Gerar código de vínculo" }),
    ).toBeNull();
  });

  it("gera o código, mostra o vínculo e desvincula", async () => {
    const fake = fakeTelegram();
    const { app, repository } = await setupApi({
      telegram: fake.integration,
    });
    const section = await openIntegrations();
    await within(section).findByText("Não vinculado");
    expect(within(section).getByText("Podem vincular: Admin.")).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole("button", { name: "Gerar código de vínculo" }),
    );
    const message = (await within(section).findByLabelText(
      "Mensagem para o bot",
    )) as HTMLInputElement;
    expect(message.value).toMatch(/^\/vincular [A-Z2-9]{8}$/);
    expect(within(section).getByText(/vale 10 minutos/)).toBeInTheDocument();

    // O usuário manda o comando ao bot (webhook do Telegram).
    const webhook = await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 1, message: { chat: { id: 42 }, text: message.value } },
    });
    expect(webhook.statusCode).toBe(200);
    expect(fake.sent[0]?.text).toMatch(/^Pronto, Aryana Dutra!/);

    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    await within(section).findByText("Vinculado");
    expect(within(section).getByText(/^Vinculado em /)).toBeInTheDocument();

    fireEvent.click(within(section).getByRole("button", { name: "Desvincular" }));
    const dialog = screen.getByRole("dialog", { name: "Desvincular Telegram" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desvincular" }));
    await within(section).findByText(/Telegram desvinculado/);
    expect(within(section).getByText("Não vinculado")).toBeInTheDocument();
    expect(await repository.getTelegramLink(clinicId, actorId)).toBeNull();
  });

  it("explica quando o perfil não pode vincular", async () => {
    const { repository } = await setupApi({
      telegram: fakeTelegram().integration,
    });
    await repository.saveTelegramSettings(clinicId, { linkRoles: [] });
    const section = await openIntegrations();
    await within(section).findByText(/Seu perfil não pode vincular/);
    expect(within(section).getByText("Podem vincular: ninguém.")).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Gerar código de vínculo" }),
    ).toBeNull();
  });

  it("escolhe os avisos do chat pessoal", async () => {
    const fake = fakeTelegram();
    const { app, repository } = await setupApi({
      telegram: fake.integration,
    });
    const section = await openIntegrations();
    fireEvent.click(
      await within(section).findByRole("button", {
        name: "Gerar código de vínculo",
      }),
    );
    const message = (await within(section).findByLabelText(
      "Mensagem para o bot",
    )) as HTMLInputElement;
    await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 1, message: { chat: { id: 42 }, text: message.value } },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    const topics = await within(section).findByRole("group", {
      name: "Avisos neste chat",
    });
    const save = within(section).getByRole("button", { name: "Salvar avisos" });
    expect(save).toBeDisabled();
    fireEvent.click(within(topics).getByRole("checkbox", { name: "Recibos" }));
    fireEvent.click(
      within(topics).getByRole("checkbox", { name: "Clientes novos" }),
    );
    fireEvent.click(save);
    await within(section).findByText("Avisos deste chat atualizados.");
    expect((await repository.getTelegramLink(clinicId, actorId))?.topics).toEqual(
      ["appointments"],
    );
  });

  it("vincula um grupo com os avisos escolhidos, edita e desvincula", async () => {
    const fake = fakeTelegram();
    const { app, repository } = await setupApi({
      telegram: fake.integration,
    });
    const section = await openIntegrations();
    await within(section).findByText("Nenhum grupo vinculado");
    fireEvent.click(within(section).getByRole("button", { name: "Vincular grupo" }));
    const dialog = screen.getByRole("dialog", {
      name: "Vincular grupo do Telegram",
    });
    for (const name of ["Recibos", "Agendamentos", "Clientes novos"])
      fireEvent.click(within(dialog).getByRole("checkbox", { name }));
    expect(
      within(dialog).getByRole("button", { name: "Gerar código" }),
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Recibos" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    const message = (await within(section).findByLabelText(
      "Mensagem para o grupo",
    )) as HTMLInputElement;
    expect(message.value).toMatch(/^\/vincular [A-Z2-9]{8}$/);

    await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: {
        update_id: 2,
        message: {
          chat: { id: -100, type: "supergroup", title: "CRM · Financeiro" },
          text: message.value,
        },
      },
    });
    expect(fake.sent.at(-1)?.text).toMatch(/vão receber avisos sobre recibos\.$/);
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    await within(section).findByText("CRM · Financeiro");
    expect(within(section).getByText(/^Recibos · vinculado em /)).toBeInTheDocument();

    fireEvent.click(
      within(section).getByRole("button", {
        name: "Editar avisos de CRM · Financeiro",
      }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar avisos do grupo" });
    fireEvent.click(within(edit).getByRole("checkbox", { name: "Agendamentos" }));
    fireEvent.click(within(edit).getByRole("button", { name: "Salvar" }));
    await within(section).findByText("Avisos do grupo atualizados.");
    expect(
      within(section).getByText(/^Recibos e Agendamentos · vinculado em /),
    ).toBeInTheDocument();

    fireEvent.click(
      within(section).getByRole("button", {
        name: "Desvincular CRM · Financeiro",
      }),
    );
    const remove = screen.getByRole("dialog", { name: "Desvincular grupo" });
    fireEvent.click(within(remove).getByRole("button", { name: "Desvincular" }));
    await within(section).findByText("Grupo desvinculado.");
    expect(await repository.listTelegramGroupLinks(clinicId)).toEqual([]);
  });

  it("Já enviei sem vínculo mantém o código do chat pessoal e explica o que conferir", async () => {
    const fake = fakeTelegram();
    const { app } = await setupApi({ telegram: fake.integration });
    const section = await openIntegrations();
    fireEvent.click(
      await within(section).findByRole("button", {
        name: "Gerar código de vínculo",
      }),
    );
    const message = (await within(section).findByLabelText(
      "Mensagem para o bot",
    )) as HTMLInputElement;
    const command = message.value;

    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent(
      /O CRM ainda não recebeu a mensagem com este código/,
    );
    expect(alert).toHaveTextContent(/chat privado com o bot do estúdio/);
    expect(alert).toHaveTextContent(/dentro do prazo do código/);
    expect(within(section).getByText("Não vinculado")).toBeInTheDocument();
    expect(
      (within(section).getByLabelText("Mensagem para o bot") as HTMLInputElement)
        .value,
    ).toBe(command);

    // Agora envia de verdade e confirma com o mesmo código.
    await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 3, message: { chat: { id: 42 }, text: command } },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    await within(section).findByText("Chat vinculado");
    expect(within(section).queryByRole("alert")).toBeNull();
    expect(within(section).queryByLabelText("Mensagem para o bot")).toBeNull();
  });

  it("Já enviei com o código pessoal vencido avisa e oferece gerar outro", async () => {
    await setupApi({ telegram: fakeTelegram().integration });
    const section = await openIntegrations();
    fireEvent.click(
      await within(section).findByRole("button", {
        name: "Gerar código de vínculo",
      }),
    );
    const first = (
      (await within(section).findByLabelText(
        "Mensagem para o bot",
      )) as HTMLInputElement
    ).value;
    afterCodeExpires();
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent(/Este código venceu às .* e não vale mais/);
    expect(within(section).queryByLabelText("Mensagem para o bot")).toBeNull();
    expect(within(section).queryByRole("button", { name: "Já enviei" })).toBeNull();

    vi.restoreAllMocks();
    fireEvent.click(
      within(section).getByRole("button", { name: "Gerar outro código" }),
    );
    const next = (await within(section).findByLabelText(
      "Mensagem para o bot",
    )) as HTMLInputElement;
    expect(next.value).toMatch(/^\/vincular [A-Z2-9]{8}$/);
    expect(next.value).not.toBe(first);
    expect(within(section).queryByRole("alert")).toBeNull();
  });

  async function generateGroupCode(section: HTMLElement) {
    await within(section).findByText("Nenhum grupo vinculado");
    fireEvent.click(within(section).getByRole("button", { name: "Vincular grupo" }));
    const dialog = screen.getByRole("dialog", {
      name: "Vincular grupo do Telegram",
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Agendamentos" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    return (
      (await within(section).findByLabelText(
        "Mensagem para o grupo",
      )) as HTMLInputElement
    ).value;
  }

  it("Já enviei sem grupo novo mantém o código do grupo e explica o que conferir", async () => {
    const fake = fakeTelegram();
    const { app } = await setupApi({ telegram: fake.integration });
    const section = await openIntegrations();
    const command = await generateGroupCode(section);

    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent(
      /O CRM ainda não recebeu a mensagem com este código/,
    );
    expect(alert).toHaveTextContent(/bot do estúdio está no grupo/);
    expect(alert).toHaveTextContent(/dentro do prazo do código/);
    expect(within(section).getByText("Nenhum grupo vinculado")).toBeInTheDocument();
    expect(
      (within(section).getByLabelText("Mensagem para o grupo") as HTMLInputElement)
        .value,
    ).toBe(command);

    await app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: {
        update_id: 4,
        message: {
          chat: { id: -200, type: "supergroup", title: "CRM · Agenda" },
          text: command,
        },
      },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    await within(section).findByText("CRM · Agenda");
    expect(within(section).queryByRole("alert")).toBeNull();
    expect(within(section).queryByLabelText("Mensagem para o grupo")).toBeNull();
  });

  it("Já enviei com o código do grupo vencido avisa e oferece gerar outro", async () => {
    await setupApi({ telegram: fakeTelegram().integration });
    const section = await openIntegrations();
    await generateGroupCode(section);
    afterCodeExpires();
    fireEvent.click(within(section).getByRole("button", { name: "Já enviei" }));
    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent(/Este código venceu às .* e não vale mais/);
    expect(within(section).queryByLabelText("Mensagem para o grupo")).toBeNull();

    vi.restoreAllMocks();
    fireEvent.click(
      within(section).getByRole("button", { name: "Gerar outro código" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Vincular grupo do Telegram",
    });
    expect(
      within(dialog).getByRole("checkbox", { name: "Agendamentos" }),
    ).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Recibos" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Gerar código" }));
    await within(section).findByLabelText("Mensagem para o grupo");
    expect(within(section).queryByRole("alert")).toBeNull();
  });
});
