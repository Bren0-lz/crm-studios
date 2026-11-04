import { INCOMPLETE_REGISTRATION_TAG, MISSING_EMAIL_TAG } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

const csvFile = (csv: string) => ({
  fileName: "clientes.csv",
  contentBase64: Buffer.from(csv).toString("base64"),
});

type Listed = {
  id: string;
  fullName: string;
  importedAt?: string;
  tags: string[];
};

describe("cliente importado sem WhatsApp, contato de emergência ou e-mail (CD3)", () => {
  it("importa, marca 'Cadastro incompleto' e 'Sem e-mail' para todos os perfis e tira ao preencher", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    await seedRoleUsers(app);
    const reception = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: tokenRole("reception") })}`,
    };
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          [
            "Nome;Telefone;CPF;WhatsApp;Contato de emergência;Telefone de emergência;E-mail",
            `Helena Planilha;11955570001;${nextTestCpf()};;;;`,
            `Igor Planilha;11955570002;${nextTestCpf()};11955570002;Mãe;11955570012;`,
            `Joana Planilha;11955570003;${nextTestCpf()};11955570003;Pai;11955570013;joana@example.com`,
            `Kaio Planilha;11955570004;${nextTestCpf()};11955570004;Tia;;kaio@example.com`,
          ].join("\n"),
        ),
      });
      expect(imported.json()).toEqual({ created: 4, skipped: 0, errors: 0 });

      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Planilha",
          headers,
        })
      ).json() as Listed[];
      const byName = (name: string) =>
        listed.find((patient) => patient.fullName === name)!;
      expect(byName("Helena Planilha").importedAt).toEqual(expect.any(String));
      expect(byName("Helena Planilha").tags).toEqual([
        INCOMPLETE_REGISTRATION_TAG,
        MISSING_EMAIL_TAG,
      ]);
      expect(byName("Igor Planilha").tags).toEqual([MISSING_EMAIL_TAG]);
      expect(byName("Joana Planilha").tags).toEqual([]);
      expect(byName("Kaio Planilha").tags).toEqual([
        INCOMPLETE_REGISTRATION_TAG,
      ]);

      // Vale para quem não vê o Financeiro, como "Falta CPF".
      const options = (
        await app.inject({
          method: "GET",
          url: "/patients/options?search=Helena Planilha",
          headers: reception,
        })
      ).json() as Listed[];
      expect(options[0]?.tags).toEqual([
        INCOMPLETE_REGISTRATION_TAG,
        MISSING_EMAIL_TAG,
      ]);

      // Preencher WhatsApp e contato de emergência tira "Cadastro incompleto"; o e-mail tira a outra.
      const helena = byName("Helena Planilha");
      const base = {
        fullName: "Helena Planilha",
        phone: "11955570001",
        cpf: (
          await app.inject({
            method: "GET",
            url: `/patients/${helena.id}`,
            headers,
          })
        ).json().cpf as string,
        tags: [],
      };
      const contact = await app.inject({
        method: "PUT",
        url: `/patients/${helena.id}`,
        headers,
        payload: { ...base, ...testPatientContact },
      });
      expect(contact.statusCode, contact.body).toBe(200);
      expect(contact.json().tags).toEqual([MISSING_EMAIL_TAG]);
      const email = await app.inject({
        method: "PUT",
        url: `/patients/${helena.id}`,
        headers,
        payload: {
          ...base,
          ...testPatientContact,
          email: "helena@example.com",
        },
      });
      expect(email.statusCode, email.body).toBe(200);
      expect(email.json().tags).toEqual([]);
      const detail = await app.inject({
        method: "GET",
        url: `/patients/${helena.id}`,
        headers: reception,
      });
      expect(detail.json().tags).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("não marca o cadastro manual e não deixa criar as etiquetas à mão", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const manual = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          fullName: "Lia Manual",
          phone: "11955570005",
          cpf: nextTestCpf(),
          ...testPatientContact,
        },
      });
      expect(manual.statusCode, manual.body).toBe(201);
      const detail = (
        await app.inject({
          method: "GET",
          url: `/patients/${manual.json().id}`,
          headers,
        })
      ).json() as Listed;
      expect(detail.importedAt).toBeUndefined();
      expect(detail.tags).toEqual([]);

      for (const [name, reason] of [
        ["cadastro INCOMPLETO", "sem WhatsApp ou sem contato de emergência"],
        ["sem e-mail", "importados sem e-mail"],
      ] as const) {
        const created = await app.inject({
          method: "POST",
          url: "/patient-tags",
          headers,
          payload: { name },
        });
        expect(created.statusCode).toBe(400);
        expect(created.json()).toMatchObject({
          code: "PATIENT_TAG_AUTOMATIC",
          message: expect.stringContaining(reason),
        });
      }

      // A etiqueta vinda da planilha não é gravada.
      await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          `Nome;Telefone;CPF;WhatsApp;Contato de emergência;Telefone de emergência;E-mail;Etiquetas\nMara Planilha;11955570006;${nextTestCpf()};11955570006;Irmã;11955570016;mara@example.com;Sem e-mail`,
        ),
      });
      const [mara] = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Mara Planilha",
          headers,
        })
      ).json() as Listed[];
      expect(mara?.tags).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
