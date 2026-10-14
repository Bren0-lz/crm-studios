import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, save } from "../../test-support/workflow-ui";

describe("manual communication workflows", () => {
  it.each(["whatsapp", "email"] as const)(
    "records a manual %s action only after confirmation",
    async (channel) => {
      const { repository } = await setupApi();
      const patient = await repository.createPatient(clinicId, {
        fullName: "Cliente de mensagens",
        phone: "11988887777",
        email: "cliente@example.com",
        tags: [],
      });
      const message = await repository.queueManualMessage(clinicId, {
        patientId: patient.id,
        channel,
        body: "Mensagem preparada pela equipe",
      });
      open(`/comunicacoes?patientId=${patient.id}`);
      const article = (
        await screen.findByText(message.body, { exact: true })
      ).closest("article")!;
      const link = within(article).getByRole("link", {
        name: channel === "whatsapp" ? "Abrir WhatsApp" : "Abrir e-mail",
      });
      expect(link.getAttribute("href")).toMatch(
        channel === "whatsapp" ? /^https:\/\/wa.me\// : /^mailto:/,
      );
      expect(
        (await repository.getCommunicationCenter(clinicId)).messages.find(
          (item) => item.id === message.id,
        )?.status,
      ).toBe("queued");
      fireEvent.click(
        within(article).getByRole("button", {
          name:
            channel === "whatsapp"
              ? "Registrar envio manual"
              : "Cancelar mensagem",
        }),
      );
      await save(
        channel === "whatsapp" ? "Registrar envio manual" : "Cancelar mensagem",
        "Confirmar",
      );
      expect(
        (await repository.getCommunicationCenter(clinicId)).messages.find(
          (item) => item.id === message.id,
        )?.manualCompletion,
      ).toMatchObject({
        actorId,
        status: channel === "whatsapp" ? "sent" : "cancelled",
      });
    },
  );
});
