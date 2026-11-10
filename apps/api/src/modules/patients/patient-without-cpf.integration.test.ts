import { MISSING_CPF_TAG, OVERDUE_PAYMENT_TAG } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  type UserRole,
  authenticatedApp,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

const csvFile = (csv: string) => ({
  fileName: "clientes.csv",
  contentBase64: Buffer.from(csv).toString("base64"),
});

// Contato completo (CD3): estes testes tratam só do CPF, sem "Cadastro incompleto"/"Sem e-mail".
const contactHeader =
  "WhatsApp;Contato de emergência;Telefone de emergência;E-mail";
const contactCells = "11955549999;Contato;11955549999;contato@example.com";
const contactFields = {
  whatsapp: "11955549999",
  emergencyContactName: "Contato",
  emergencyContactPhone: "11955549999",
  email: "contato@example.com",
};

type Listed = { id: string; fullName: string; cpf?: string; tags: string[] };

describe("cliente importado sem CPF (B6-05)", () => {
  it("importa sem CPF, aplica 'Falta CPF' para todos os perfis e não deixa criá-la à mão", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    await seedRoleUsers(app);
    const roleHeaders = (role: UserRole) => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          [
            `Nome;Telefone;CPF;${contactHeader}`,
            `Bianca Sem Documento;11955540001;;${contactCells}`,
            `Caio Sem Documento;11955540002;;${contactCells}`,
            `Davi Com Documento;11955540003;${nextTestCpf()};${contactCells}`,
            `Erro De Cpf;11955540004;529.982.247-24;${contactCells}`,
          ].join("\n"),
        ),
      });
      // CPF errado não barra a linha: entra sem CPF e com "CPF inválido" (no lugar de "Falta CPF").
      expect(imported.json()).toEqual({
        created: 4,
        skipped: 0,
        errors: 0,
        updated: 0,
      });

      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Documento",
          headers,
        })
      ).json() as Listed[];
      const byName = (name: string) =>
        listed.find((patient) => patient.fullName === name)!;
      expect(byName("Bianca Sem Documento").cpf).toBeUndefined();
      expect(byName("Bianca Sem Documento").tags).toEqual([MISSING_CPF_TAG]);
      expect(byName("Caio Sem Documento").tags).toEqual([MISSING_CPF_TAG]);
      expect(byName("Davi Com Documento").tags).toEqual([]);

      // Recepção não vê o Financeiro ("Pagamento atrasado"), mas vê "Falta CPF".
      const reception = roleHeaders("reception");
      const options = (
        await app.inject({
          method: "GET",
          url: "/patients/options?search=Bianca",
          headers: reception,
        })
      ).json() as Listed[];
      expect(options[0]?.tags).toEqual([MISSING_CPF_TAG]);
      const forReception = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Documento",
          headers: reception,
        })
      ).json() as Listed[];
      expect(
        forReception
          .filter((patient) => patient.tags.includes(MISSING_CPF_TAG))
          .map((patient) => patient.fullName)
          .sort(),
      ).toEqual(["Bianca Sem Documento", "Caio Sem Documento"]);
      expect(
        forReception.flatMap((patient) => patient.tags),
      ).not.toContain(OVERDUE_PAYMENT_TAG);

      // A etiqueta vinda da planilha não é gravada.
      const fromSheet = await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          `Nome;Telefone;CPF;${contactHeader};Etiquetas\nFlora Etiquetada;11955540005;${nextTestCpf()};${contactCells};Falta CPF`,
        ),
      });
      expect(fromSheet.json()).toMatchObject({ created: 1, errors: 0 });
      const flora = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Flora",
          headers,
        })
      ).json() as Listed[];
      expect(flora[0]?.tags).toEqual([]);

      const manual = await app.inject({
        method: "POST",
        url: "/patient-tags",
        headers,
        payload: { name: "falta cpf" },
      });
      expect(manual.statusCode).toBe(400);
      expect(manual.json()).toMatchObject({
        code: "PATIENT_TAG_AUTOMATIC",
        message: expect.stringContaining("clientes sem CPF"),
      });
    } finally {
      await app.close();
    }
  });

  it("edita cliente sem CPF, tira a etiqueta ao preencher e não deixa apagar o CPF", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      await app.inject({
        method: "POST",
        url: "/patients/import",
        headers,
        payload: csvFile(
          `Nome;Telefone;${contactHeader}\nGina Importada;11955540020;${contactCells}`,
        ),
      });
      const [gina] = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Gina Importada",
          headers,
        })
      ).json() as Listed[];
      const url = `/patients/${gina!.id}`;
      const base = { fullName: "Gina Importada", tags: [], ...contactFields };

      const phoneOnly = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...base, phone: "11955540021", cpf: "" },
      });
      expect(phoneOnly.statusCode, phoneOnly.body).toBe(200);
      expect(phoneOnly.json()).toMatchObject({
        phone: "11955540021",
        tags: [MISSING_CPF_TAG],
      });
      expect(phoneOnly.json().cpf).toBeUndefined();

      const invalid = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...base, phone: "11955540021", cpf: "529.982.247-24" },
      });
      expect(invalid.statusCode).toBe(400);

      const other = (
        await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: {
            fullName: "Outra Pessoa",
            phone: "11955540022",
            whatsapp: "11955540022",
            emergencyContactName: "Outra Pessoa",
            emergencyContactPhone: "11955540022",
            cpf: nextTestCpf(),
          },
        })
      ).json() as { cpf: string };
      const duplicated = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...base, phone: "11955540021", cpf: other.cpf },
      });
      expect(duplicated.statusCode).toBe(409);
      expect(duplicated.json().code).toBe("PATIENT_DUPLICATE");

      const cpf = nextTestCpf();
      const filled = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ...base, phone: "11955540021", cpf },
      });
      expect(filled.statusCode).toBe(200);
      expect(filled.json()).toMatchObject({ cpf, tags: [] });
      const listed = (
        await app.inject({
          method: "GET",
          url: "/patients?search=Gina Importada",
          headers,
        })
      ).json() as Listed[];
      expect(listed[0]?.tags).toEqual([]);

      for (const payload of [
        { ...base, phone: "11955540021", cpf: "" },
        { ...base, phone: "11955540021" },
      ]) {
        const cleared = await app.inject({
          method: "PUT",
          url,
          headers,
          payload,
        });
        expect(cleared.statusCode).toBe(400);
        expect(cleared.json()).toMatchObject({
          code: "PATIENT_CPF_REQUIRED",
          message: "O CPF já cadastrado não pode ser apagado.",
        });
      }
      const after = await app.inject({ method: "GET", url, headers });
      expect(after.json().cpf).toBe(cpf);
    } finally {
      await app.close();
    }
  });

  it("continua exigindo CPF no cadastro manual", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const response = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: { fullName: "Manual Sem CPF", phone: "11955540010" },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
