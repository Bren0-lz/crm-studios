import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  open("/configuracoes?secao=integracoes");
  const panel = await screen.findByRole("tabpanel", { name: "Integrações" });
  return within(panel).findByRole("region", { name: "Telegram" });
}

describe("Telegram em Configurações › Integrações", () => {
  it("avisa que a integração está desligada sem o token do bot", async () => {
    await setupApi({ telegram: null });
    const section = await openIntegrations();
    await within(section).findByText("Integração desligada");
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
});
