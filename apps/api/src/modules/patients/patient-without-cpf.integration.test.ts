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
            "Nome;Telefone;CPF",
            "Bianca Sem Documento;11955540001;",
            "Caio Sem Documento;11955540002;",
            `Davi Com Documento;11955540003;${nextTestCpf()}`,
            "Erro De Cpf;11955540004;529.982.247-24",
          ].join("\n"),
        ),
      });
      expect(imported.json()).toEqual({ created: 3, skipped: 0, errors: 1 });

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
          `Nome;Telefone;CPF;Etiquetas\nFlora Etiquetada;11955540005;${nextTestCpf()};Falta CPF`,
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
