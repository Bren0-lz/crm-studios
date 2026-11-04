import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const csvFile = (csv: string) => ({
  fileName: "clientes.csv",
  contentBase64: Buffer.from(csv).toString("base64"),
});

describe("WhatsApp e contato de emergência obrigatórios no cadastro manual (CD1)", () => {
  it("exige os três campos no cadastro manual e aceita o próprio cliente como contato", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const complete = {
        cpf: nextTestCpf(),
        fullName: "Cliente Contato Próprio",
        phone: "11955560001",
        whatsapp: "11955560001",
        emergencyContactName: "Cliente Contato Próprio",
        emergencyContactPhone: "11955560001",
        tags: [],
      };
      for (const [field, message] of [
        ["whatsapp", "Informe o WhatsApp com DDD."],
        ["emergencyContactName", "Informe o nome do contato de emergência."],
        [
          "emergencyContactPhone",
          "Informe o telefone do contato de emergência com DDD.",
        ],
      ] as const) {
        for (const payload of [
          { ...complete, [field]: "" },
          Object.fromEntries(
            Object.entries(complete).filter(([key]) => key !== field),
          ),
        ]) {
          const refused = await app.inject({
            method: "POST",
            url: "/patients",
            headers,
            payload,
          });
          expect(refused.statusCode).toBe(400);
          expect(refused.json()).toEqual({
            code: "VALIDATION_ERROR",
            message,
          });
        }
      }
      const guided = await app.inject({
        method: "POST",
        url: "/patients/guided",
        headers,
        payload: {
          next: "none",
          patient: { ...complete, whatsapp: "", cpf: nextTestCpf() },
        },
      });
      expect(guided.statusCode).toBe(400);

      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: complete,
      });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json()).toMatchObject({
        whatsapp: "11955560001",
        emergencyContactName: "Cliente Contato Próprio",
        emergencyContactPhone: "11955560001",
      });
    } finally {
      await app.close();
    }
  });

  it("importa sem os campos, deixa editar vazio e não deixa apagar o que já existe", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          [
            "Nome;Telefone;CPF",
            `Iara Importada Sem Contato;11955560010;${nextTestCpf()}`,
          ].join("\n"),
        ),
      });
      expect(imported.json()).toMatchObject({ created: 1, errors: 0 });
      const patient = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Iara Importada",
          headers,
        })
      ).json()[0] as {
        id: string;
        cpf: string;
        fullName: string;
        phone: string;
        whatsapp?: string;
      };
      expect(patient.whatsapp).toBeUndefined();
      const url = `/patients/${patient.id}`;
      const base = {
        cpf: patient.cpf,
        fullName: patient.fullName,
        phone: patient.phone,
        tags: [],
      };

      // Cadastro antigo: segue editável sem WhatsApp nem contato de emergência.
      const kept = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: {
          ...base,
          whatsapp: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          notes: "Sem contato ainda",
        },
      });
      expect(kept.statusCode, kept.body).toBe(200);
      // Sem WhatsApp, a mensagem vai para o telefone de contato.
      const fallback = await app.inject({
        method: "POST",
        url: "/communications/messages",
        headers,
        payload: { patientId: patient.id, channel: "whatsapp", body: "Olá" },
      });
      expect(fallback.json().recipient).toBe(patient.phone);

      const filled = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: {
          ...base,
          whatsapp: "11955560011",
          emergencyContactName: "Rui Importado (irmão)",
          emergencyContactPhone: "11955560012",
        },
      });
      expect(filled.statusCode, filled.body).toBe(200);

      for (const [payload, code, message] of [
        [
          {
            ...base,
            whatsapp: "",
            emergencyContactName: "Rui Importado (irmão)",
            emergencyContactPhone: "11955560012",
          },
          "PATIENT_WHATSAPP_REQUIRED",
          "O WhatsApp já cadastrado não pode ser apagado.",
        ],
        [
          {
            ...base,
            whatsapp: "11955560011",
            emergencyContactPhone: "11955560012",
          },
          "PATIENT_EMERGENCY_CONTACT_REQUIRED",
          "O contato de emergência já cadastrado não pode ser apagado.",
        ],
        [
          {
            ...base,
            whatsapp: "11955560011",
            emergencyContactName: "Rui Importado (irmão)",
            emergencyContactPhone: "",
          },
          "PATIENT_EMERGENCY_CONTACT_REQUIRED",
          "O contato de emergência já cadastrado não pode ser apagado.",
        ],
      ] as const) {
        const cleared = await app.inject({
          method: "PUT",
          url,
          headers,
          payload,
        });
        expect(cleared.statusCode).toBe(400);
        expect(cleared.json()).toEqual({ code, message });
      }
      const after = await app.inject({ method: "GET", url, headers });
      expect(after.json()).toMatchObject({
        whatsapp: "11955560011",
        emergencyContactName: "Rui Importado (irmão)",
        emergencyContactPhone: "11955560012",
      });
    } finally {
      await app.close();
    }
  });
});
