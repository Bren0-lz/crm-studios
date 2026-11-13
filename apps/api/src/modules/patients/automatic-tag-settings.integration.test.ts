import { MISSING_CPF_TAG, MISSING_EMAIL_TAG } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

describe("nome e cor das etiquetas automáticas (AT1)", () => {
  it("lista o padrão, troca nome e cor, valida repetição e restaura", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };

    const initial = await app.inject({
      method: "GET",
      url: "/patient-tags/automatic",
      headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(
      (initial.json() as { key: string; name: string }[]).map((tag) => [
        tag.key,
        tag.name,
      ]),
    ).toEqual([
      ["overdue_payment", "Pagamento atrasado"],
      ["missing_cpf", "Falta CPF"],
      ["invalid_cpf", "CPF inválido"],
      ["incomplete_registration", "Cadastro incompleto"],
      ["missing_email", "Sem e-mail"],
    ]);

    const updated = await app.inject({
      method: "PATCH",
      url: "/patient-tags/automatic/missing_cpf",
      headers,
      payload: { name: "CPF pendente", color: "#FF0000" },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      key: "missing_cpf",
      defaultName: MISSING_CPF_TAG,
      name: "CPF pendente",
      color: "#ff0000",
      customized: true,
    });

    // Repetir uma etiqueta configurada ou outra automática (nome padrão ou atual) é recusado.
    await app.inject({
      method: "POST",
      url: "/patient-tags",
      headers,
      payload: { name: "Gestante" },
    });
    for (const name of ["gestante", "Sem e-mail", "cpf pendente"]) {
      const duplicate = await app.inject({
        method: "PATCH",
        url: "/patient-tags/automatic/missing_email",
        headers,
        payload: { name },
      });
      expect(duplicate.statusCode, name).toBe(
        name === "Sem e-mail" ? 200 : 409,
      );
      if (name !== "Sem e-mail")
        expect(duplicate.json().code).toBe("PATIENT_TAG_DUPLICATE");
    }

    // A etiqueta manual não pode usar o nome dado à automática.
    const manual = await app.inject({
      method: "POST",
      url: "/patient-tags",
      headers,
      payload: { name: "CPF Pendente" },
    });
    expect(manual.statusCode).toBe(400);
    expect(manual.json()).toMatchObject({
      code: "PATIENT_TAG_AUTOMATIC",
      message:
        "“CPF pendente” é uma etiqueta automática: aparece sozinha para clientes sem CPF.",
    });

    const invalid = await app.inject({
      method: "PATCH",
      url: "/patient-tags/automatic/missing_cpf",
      headers,
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
    const unknown = await app.inject({
      method: "PATCH",
      url: "/patient-tags/automatic/outra",
      headers,
      payload: { name: "Outra" },
    });
    expect(unknown.statusCode).toBe(404);

    const reset = await app.inject({
      method: "DELETE",
      url: "/patient-tags/automatic/missing_cpf",
      headers,
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({
      name: MISSING_CPF_TAG,
      color: "#6d28d9",
      customized: false,
    });
    await app.close();
  });

  it("mantém o nome padrão nos clientes e usa o configurado na exportação", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: {
        fileName: "clientes.csv",
        contentBase64: Buffer.from(
          `Nome;Telefone;CPF;WhatsApp;Contato de emergência;Telefone de emergência;E-mail\nBia Sem Email;11955551234;${nextTestCpf()};11955551234;Mãe;11955554321;`,
        ).toString("base64"),
      },
    });
    expect(created.statusCode, created.body).toBeLessThan(300);
    await app.inject({
      method: "PATCH",
      url: "/patient-tags/automatic/missing_email",
      headers,
      payload: { name: "Pedir e-mail" },
    });
    const patients = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json() as { fullName: string; tags: string[] }[];
    const bia = patients.find((item) => item.fullName === "Bia Sem Email");
    expect(bia?.tags).toContain(MISSING_EMAIL_TAG);

    const exported = await app.inject({
      method: "GET",
      url: `/patients/export?format=csv&columns=fullName,tags&tags=${encodeURIComponent(MISSING_EMAIL_TAG)}`,
      headers,
    });
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.body).toContain("Pedir e-mail");
    expect(exported.body).not.toContain(MISSING_EMAIL_TAG);
    await app.close();
  });

  it("só quem edita etiquetas troca o nome; quem vê clientes lê", async () => {
    const { app } = await authenticatedApp();
    await seedRoleUsers(app);
    const reception = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: tokenRole("reception") })}`,
    };
    const read = await app.inject({
      method: "GET",
      url: "/patient-tags/automatic",
      headers: reception,
    });
    expect(read.statusCode).toBe(200);
    for (const method of ["PATCH", "DELETE"] as const) {
      const denied = await app.inject({
        method,
        url: "/patient-tags/automatic/missing_cpf",
        headers: reception,
        ...(method === "PATCH" ? { payload: { name: "Outro" } } : {}),
      });
      expect(denied.statusCode, method).toBe(403);
    }
    await app.close();
  });
});
