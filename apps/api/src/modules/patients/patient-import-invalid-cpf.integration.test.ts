import { INVALID_CPF_TAG, MISSING_CPF_TAG } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
import "../../test-support/legacy-setup.js";

const csvFile = (csv: string) => ({
  fileName: "clientes.csv",
  contentBase64: Buffer.from(csv).toString("base64"),
});

type Listed = {
  id: string;
  fullName: string;
  cpf?: string;
  importedInvalidCpf?: string;
  tags: string[];
};

describe("cliente importado com CPF errado", () => {
  it("entra sem CPF, com a etiqueta 'CPF inválido', que sai quando o CPF é corrigido", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          [
            "Nome;Telefone;CPF;WhatsApp;Contato de emergência;Telefone de emergência;E-mail",
            "Otávio Errado;11955590001;123.456.789-00;11955590001;Mãe;11955590011;otavio@example.com",
            "Paula Vazio;11955590002;;11955590002;Pai;11955590012;paula@example.com",
          ].join("\n"),
        ),
      });
      expect(imported.json()).toEqual({
        created: 2,
        skipped: 0,
        errors: 0,
        updated: 0,
      });

      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients",
          headers,
        })
      ).json() as Listed[];
      const byName = (name: string) =>
        listed.find((patient) => patient.fullName === name)!;
      const otavio = byName("Otávio Errado");
      expect(otavio.cpf).toBeUndefined();
      expect(otavio.importedInvalidCpf).toBe("123.456.789-00");
      expect(otavio.tags).toEqual([INVALID_CPF_TAG]);
      expect(byName("Paula Vazio").tags).toEqual([MISSING_CPF_TAG]);

      const fixed = await app.inject({
        method: "PUT",
        url: `/patients/${otavio.id}`,
        headers,
        payload: {
          fullName: "Otávio Errado",
          phone: "11955590001",
          cpf: nextTestCpf(),
          email: "otavio@example.com",
          tags: [],
          ...testPatientContact,
        },
      });
      expect(fixed.statusCode, fixed.body).toBe(200);
      expect(fixed.json().tags).toEqual([]);

      // Etiqueta automática: não pode ser criada à mão.
      const created = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers,
        payload: { name: "cpf INVALIDO" },
      });
      expect(created.statusCode).toBe(400);
      expect(created.json()).toMatchObject({
        code: "PATIENT_TAG_AUTOMATIC",
        message: expect.stringContaining("CPF errado"),
      });
    } finally {
      await app.close();
    }
  });
});
