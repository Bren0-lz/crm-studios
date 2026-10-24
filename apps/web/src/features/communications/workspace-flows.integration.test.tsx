import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

describe("communication workflows", () => {
  it("keeps only campaigns and standard messages, sending old queue links to campaigns", async () => {
    await setupApi();
    open("/comunicacoes?aba=fila");
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Campanhas",
      "Mensagens padrão",
    ]);
    expect(screen.getByRole("tab", { name: "Campanhas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Fila e lembretes" })).toBeNull();
  });

  it("blocks and releases a message channel from the client record", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente de mensagens",
      phone: "11988887777",
      email: "cliente@example.com",
      tags: [],
    });
    await repository.setCommunicationPreference(clinicId, {
      patientId: patient.id,
      channel: "email",
      allowed: false,
    });
    open(`/clientes/${patient.id}`);
    const group = await screen.findByRole("group", {
      name: "Aceita mensagens por",
    });
    const whatsapp = await within(group).findByRole("checkbox", {
      name: "WhatsApp",
    });
    expect(whatsapp).toBeChecked();
    expect(within(group).getByRole("checkbox", { name: "E-mail" })).not
      .toBeChecked();
    fireEvent.click(whatsapp);
    await screen.findByText("Envios por este canal bloqueados.");
    await waitFor(() => expect(whatsapp).not.toBeChecked());
    expect(
      (await repository.getCommunicationCenter(clinicId)).preferences.find(
        (item) => item.patientId === patient.id && item.channel === "whatsapp",
      )?.allowed,
    ).toBe(false);
  });
});
