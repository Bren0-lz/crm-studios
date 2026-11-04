import type { AdminAuditPage, PatientTimelineEntry } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";

const client = {
  fullName: "Cliente Histórico",
  cpf: "529.982.247-25",
  phone: "11999998888",
  whatsapp: "11999998888",
  emergencyContactName: "Cliente Histórico",
  emergencyContactPhone: "11999998888",
  email: "cliente@example.com",
  tags: [],
};

describe("client edit history", () => {
  it("records the changed fields and the optional reason of each edit", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: client,
      });
      expect(created.statusCode).toBe(201);
      const url = `/patients/${created.json().id as string}`;
      const history = async () =>
        (
          await app.inject({
            url: "/history/audit-events?action=operation.patients.update",
            headers,
          })
        ).json<AdminAuditPage>().items;

      const edited = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: {
          ...client,
          phone: "11988887777",
          birthDate: "1990-05-20",
          email: "",
          changeReason: "  Cliente trocou de número  ",
        },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).not.toHaveProperty("changeReason");
      const [event] = await history();
      expect(event?.metadata).toMatchObject({
        reason: "Cliente trocou de número",
        changes: [
          {
            field: "email",
            label: "E-mail",
            before: "cliente@example.com",
            after: null,
          },
          {
            field: "phone",
            label: "Telefone",
            before: "11999998888",
            after: "11988887777",
          },
          {
            field: "birthDate",
            label: "Data de nascimento",
            before: null,
            after: "20/05/1990",
          },
        ],
      });
      // Corpo da requisição não vai para o histórico, só os campos comparados.
      expect(JSON.stringify(event)).not.toContain("52998224725");

      // A aba Histórico da ficha também mostra a edição, com o que mudou e o motivo.
      const timeline = (
        await app.inject({ url: `${url}/timeline`, headers })
      ).json<PatientTimelineEntry[]>();
      const edit = timeline.find((entry) => entry.kind === "patient_updated");
      expect(edit?.title).toMatch(/^Cadastro editado/);
      expect(edit?.detail).toContain("Telefone: 11999998888 → 11988887777");
      expect(edit?.detail).toContain("E-mail: cliente@example.com → (vazio)");
      expect(edit?.detail).toContain("Motivo: Cliente trocou de número");

      // Sem motivo (como os clientes antigos): grava só o que mudou.
      const same = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...client, phone: "11988887777", birthDate: "1990-05-20" },
      });
      expect(same.statusCode).toBe(200);
      const [latest] = await history();
      expect(latest?.metadata.changes).toEqual([
        {
          field: "email",
          label: "E-mail",
          before: null,
          after: "cliente@example.com",
        },
      ]);
      expect(latest?.metadata).not.toHaveProperty("reason");

      const tooLong = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...client, changeReason: "x".repeat(501) },
      });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().message).toContain("500 caracteres");
    } finally {
      await app.close();
    }
  });

  it("keeps the reason when changing the client status", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: client,
      });
      const status = await app.inject({
        method: "PATCH",
        url: `/patients/${created.json().id as string}/status`,
        headers,
        payload: { status: "inactive", changeReason: "Mudou de cidade" },
      });
      expect(status.statusCode).toBe(200);
      const page = (
        await app.inject({ url: "/history/audit-events", headers })
      ).json<AdminAuditPage>();
      expect(
        page.items.find((item) => item.metadata.reason === "Mudou de cidade"),
      ).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
