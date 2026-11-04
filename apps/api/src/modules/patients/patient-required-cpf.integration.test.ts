import { MISSING_CPF_TAG } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";

describe("required client CPF", () => {
  it("accepts imports without CPF (B6-05) but requires it when converting a lead into a client", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      for (const [csv, created] of [
        ["Nome;Telefone\nCliente Importado;11999998888", 1],
        // Mesmo telefone: duplicado (sem CPF, o telefone é a chave).
        ["Nome;Telefone;CPF\nCliente Importado;11999998888;", 0],
      ] as const) {
        const file = {
          fileName: "clientes.csv",
          contentBase64: Buffer.from(csv).toString("base64"),
        };
        const preview = await app.inject({
          method: "POST",
          url: "/patients/import/preview",
          headers,
          payload: file,
        });
        expect(preview.json()).toMatchObject({
          totals: { valid: created, error: 0, duplicate: 1 - created },
        });
        const imported = await app.inject({
          method: "POST",
          url: "/patients/import",
          headers,
          payload: file,
        });
        expect(imported.json()).toEqual({
          created,
          skipped: 1 - created,
          errors: 0,
        });
      }
      const lead = await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName: "Lead sem CPF",
          phone: "11999998888",
          source: "Site",
          interest: "Pilates",
        },
      });
      expect(lead.statusCode).toBe(201);
      const url = `/leads/${lead.json().id}/convert`;
      const missing = await app.inject({
        method: "POST",
        url,
        headers,
        payload: {},
      });
      expect(missing.statusCode).toBe(400);
      const converted = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { cpf: "529.982.247-25" },
      });
      expect(converted.statusCode).toBe(200);
      expect(converted.json().patient.cpf).toBe("52998224725");
      // Mesmo telefone do importado sem CPF: reaproveita o cadastro e a etiqueta sai sozinha.
      expect(converted.json().reusedExisting).toBe(true);
      const detail = await app.inject({
        method: "GET",
        url: `/patients/${converted.json().patient.id}`,
        headers,
      });
      expect(detail.json().tags).not.toContain(MISSING_CPF_TAG);
    } finally {
      await app.close();
    }
  });
  it("rejects missing, blank and invalid CPF in regular and guided registrations", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      for (const cpf of [
        undefined,
        null,
        "",
        "   ",
        "11111111111",
        "52998224724",
      ]) {
        const patient = {
          fullName: "Cliente CPF obrigatório",
          phone: "11999998888",
          whatsapp: "11999998888",
          emergencyContactName: "Cliente CPF obrigatório",
          emergencyContactPhone: "11999998888",
          cpf,
        };
        for (const url of ["/patients", "/patients/guided"]) {
          const response = await app.inject({
            method: "POST",
            url,
            headers,
            payload: url.endsWith("guided")
              ? { next: "none", patient }
              : patient,
          });
          expect(response.statusCode, response.body).toBe(400);
          expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
        }
      }
      const listed = await app.inject({
        method: "GET",
        url: "/patients?search=Cliente%20CPF%20obrigatório",
        headers,
      });
      expect(listed.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("normalizes a valid CPF, prevents duplicates and refuses removing it on edit", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patient = {
      fullName: "Cliente CPF obrigatório",
      phone: "11999998888",
      whatsapp: "11999998888",
      emergencyContactName: "Cliente CPF obrigatório",
      emergencyContactPhone: "11999998888",
      cpf: "529.982.247-25",
    };
    try {
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: patient,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().cpf).toBe("52998224725");
      const duplicate = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: { ...patient, cpf: "52998224725" },
      });
      expect(duplicate.statusCode).toBe(409);
      for (const cpf of [undefined, ""]) {
        const updated = await app.inject({
          method: "PUT",
          url: `/patients/${created.json().id}`,
          headers,
          payload: { ...patient, cpf },
        });
        expect(updated.statusCode).toBe(400);
      }
      const listed = await app.inject({
        method: "GET",
        url: "/patients?search=52998224725",
        headers,
      });
      expect(listed.json()).toEqual([
        expect.objectContaining({ cpf: "52998224725" }),
      ]);
    } finally {
      await app.close();
    }
  });
});
