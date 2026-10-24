import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import type { ExternalOperation } from "@crm/contracts";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("manual external operations", () => {
  it("preserves balances, stores immutable proof and scopes references and downloads", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente documento externo",
      phone: "11988887777",
      tags: [],
    });
    const invoice = await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Serviço registrado",
      amountInCents: 5000,
      dueDate: "2039-06-10",
    });
    const before = await repository.getFinancialWorkspace(clinicId);
    const content = Buffer.from("%PDF-1.4\nComprovante externo\n%%EOF");
    const input = {
      kind: "fiscal",
      counterpart: "Emissor externo",
      reference: "NF-2039-17",
      occurredOn: "2039-06-10",
      receivableId: invoice.id,
      notes: "Emissão realizada pela equipe no provedor",
      fileName: "comprovante.pdf",
      mimeType: "application/pdf",
      sizeInBytes: content.length,
      contentBase64: content.toString("base64"),
    };
    const results = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          url: "/finance/external-operations",
          headers,
          payload: input,
        }),
      ),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const record = results
      .find((result) => result.statusCode === 201)!
      .json<ExternalOperation>();
    expect(record).toMatchObject({
      patientId: patient.id,
      patientName: patient.fullName,
      authorId: actorId,
      reference: input.reference,
      sizeInBytes: content.length,
    });
    expect(record.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(record).not.toHaveProperty("contentBase64");
    expect(
      (
        await app.inject({
          url: `/finance/external-operations?patientId=${patient.id}`,
          headers,
        })
      ).json(),
    ).toEqual([record]);
    expect(
      (
        await app.inject({
          url: `/finance/external-operations/${record.id}/content`,
          headers,
        })
      ).json(),
    ).toMatchObject({
      contentBase64: input.contentBase64,
      sha256: record.sha256,
    });
    expect(await repository.getFinancialWorkspace(clinicId)).toEqual(before);
    expect(
      await repository.listExternalOperations(
        "99999999-9999-4999-8999-999999999999",
      ),
    ).toEqual([]);
    expect(
      await repository.getExternalOperationContent(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        record.id,
      ),
    ).toBeNull();
    const other = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Outro cliente externo",
      phone: "11955554444",
      tags: [],
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/finance/external-operations",
          headers,
          payload: { ...input, reference: "NF-18", patientId: other.id },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/finance/external-operations",
          headers,
          payload: {
            ...input,
            reference: "NF-19",
            contentBase64: Buffer.from("arquivo inválido").toString("base64"),
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(await repository.listExternalOperations(clinicId)).toHaveLength(1);
    expect(await repository.listAdminAuditEvents(clinicId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "external.operation_recorded",
          actorUserId: actorId,
        }),
        expect.objectContaining({
          action: "external.operation_downloaded",
          actorUserId: actorId,
        }),
      ]),
    );
  });

  it("requires explicit proof access independently of legacy financial access", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    for (const [index, permissions] of [
      ["legacy", ["finance.view"]],
      ["proof", ["finance.view", "finance.external_records_view"]],
    ] as const) {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: `Leitura ${index}`,
          email: `${index}@external.test`,
          password: "Password123",
          role: "user",
          permissions: [...permissions],
        },
        "unused",
      );
      const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      expect(
        (await app.inject({ url: "/finance/external-operations", headers }))
          .statusCode,
      ).toBe(index === "proof" ? 200 : 403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/finance/external-operations",
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
    }
  });
});
