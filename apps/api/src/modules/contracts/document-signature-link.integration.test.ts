import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const signatureImage = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

async function issuedDocument(options: { trustProxy?: number } = {}) {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false, ...options });
  apps.push(app);
  const [patient] = await repository.listPatients(clinicId);
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato Pilates",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} para aulas de Pilates.",
  });
  const document = await repository.createIssuedDocument(clinicId, actorId, {
    patientId: patient!.id,
    templateId: template.id,
    title: "Contrato Pilates",
  });
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { app, repository, document, patient: patient!, headers };
}

describe("document signature link", () => {
  it("records the views and the client's signature through the public link", async () => {
    const { app, repository, document, patient, headers } =
      await issuedDocument();
    const draftLink = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(draftLink.statusCode).toBe(409);
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );

    const created = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(created.statusCode).toBe(200);
    const share = created.json();
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(share.patientPhone).toBe(patient.phone);
    expect(share.document.signatureLink).toMatchObject({
      token: share.token,
      viewCount: 0,
    });
    // Reenviar reaproveita o mesmo link.
    const again = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(again.json().token).toBe(share.token);

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/public/document-signatures/inexistente",
        })
      ).statusCode,
    ).toBe(404);
    const opened = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${share.token}`,
      headers: { "user-agent": "Celular do cliente" },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({
      title: "Contrato Pilates",
      patientName: patient.fullName,
      status: "pending",
      snapshotBody: document.snapshotBody,
    });
    expect(opened.json()).not.toHaveProperty("clinicId");

    const invalid = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${share.token}`,
      payload: { signerName: "Cliente", accepted: false, signatureImage },
    });
    expect(invalid.statusCode).toBe(400);
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${share.token}`,
      headers: { "user-agent": "Celular do cliente" },
      payload: {
        signerName: patient.fullName,
        signerCpf: "123.456.789-09",
        accepted: true,
        signatureImage,
      },
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toMatchObject({
      status: "signed",
      signerName: patient.fullName,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/document-signatures/${share.token}`,
          payload: {
            signerName: "Outra pessoa",
            accepted: true,
            signatureImage,
          },
        })
      ).statusCode,
    ).toBe(409);

    const details = await app.inject({
      method: "GET",
      url: `/documents/${document.id}/signature-link`,
      headers,
    });
    expect(details.json()).toMatchObject({
      viewCount: 1,
      views: [{ userAgent: "Celular do cliente" }],
      signerName: patient.fullName,
      signerCpf: "12345678909",
      signatureImage,
      signerUserAgent: "Celular do cliente",
      documentSha256: signed.json().documentSha256,
    });
    const [listed] = (
      await app.inject({ method: "GET", url: "/documents", headers })
    ).json();
    expect(listed.signatureLink).toMatchObject({
      viewCount: 1,
      signerName: patient.fullName,
    });
    expect(listed.signatureLink.signedAt).toBeTruthy();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/documents/${document.id}/signature-link`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it("refuses signatures after the document is cancelled", async () => {
    const { app, repository, document, headers } = await issuedDocument();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const { token } = (
      await app.inject({
        method: "POST",
        url: `/documents/${document.id}/signature-link`,
        headers,
      })
    ).json();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "cancelled",
    );
    const opened = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${token}`,
    });
    expect(opened.json().status).toBe("cancelled");
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${token}`,
      payload: { signerName: "Cliente", accepted: true, signatureImage },
    });
    expect(signed.statusCode).toBe(410);
  });

  it("rejects a signature with an invalid CPF", async () => {
    const { app, repository, document, headers } = await issuedDocument();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const { token } = (
      await app.inject({
        method: "POST",
        url: `/documents/${document.id}/signature-link`,
        headers,
      })
    ).json();
    const signed = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${token}`,
      payload: {
        signerName: "Cliente",
        signerCpf: "123.456.789-00",
        accepted: true,
        signatureImage,
      },
    });
    expect(signed.statusCode).toBe(400);
    expect(signed.json().code).toBe("VALIDATION_ERROR");
  });

  it("records the client's IP from X-Forwarded-For only behind a trusted proxy", async () => {
    for (const [trustProxy, expected] of [
      [1, "203.0.113.9"],
      [0, "127.0.0.1"],
    ] as const) {
      const { app, repository, document, headers } = await issuedDocument({
        trustProxy,
      });
      await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "issued",
      );
      const { token } = (
        await app.inject({
          method: "POST",
          url: `/documents/${document.id}/signature-link`,
          headers,
        })
      ).json();
      const forwarded = { "x-forwarded-for": "203.0.113.9" };
      await app.inject({
        method: "GET",
        url: `/public/document-signatures/${token}`,
        headers: forwarded,
      });
      await app.inject({
        method: "POST",
        url: `/public/document-signatures/${token}`,
        headers: forwarded,
        payload: { signerName: "Cliente", accepted: true, signatureImage },
      });
      const details = (
        await app.inject({
          method: "GET",
          url: `/documents/${document.id}/signature-link`,
          headers,
        })
      ).json();
      expect(details.views[0].ipAddress).toBe(expected);
      expect(details.signerIpAddress).toBe(expected);
    }
  });

  it("expires the link after 7 days and a new send replaces the token", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-20T12:00:00Z"),
    });
    const { app, repository, document, headers } = await issuedDocument();
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const first = (
      await app.inject({
        method: "POST",
        url: `/documents/${document.id}/signature-link`,
        headers,
      })
    ).json();
    expect(first.document.signatureLink.expiresAt).toBe(
      "2026-10-27T12:00:00.000Z",
    );
    await app.inject({
      method: "GET",
      url: `/public/document-signatures/${first.token}`,
    });

    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const expired = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${first.token}`,
    });
    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toMatchObject({
      code: "DOCUMENT_SIGNATURE_LINK_EXPIRED",
      message: "Este link expirou. Peça um novo à clínica.",
    });
    const lateSign = await app.inject({
      method: "POST",
      url: `/public/document-signatures/${first.token}`,
      payload: { signerName: "Cliente", accepted: true, signatureImage },
    });
    expect(lateSign.statusCode).toBe(410);
    // A visualização recusada não entra no registro.
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/documents/${document.id}/signature-link`,
          headers,
        })
      ).json().viewCount,
    ).toBe(1);

    const renewed = (
      await app.inject({
        method: "POST",
        url: `/documents/${document.id}/signature-link`,
        headers,
      })
    ).json();
    expect(renewed.token).not.toBe(first.token);
    expect(renewed.document.signatureLink.expiresAt).toBe(
      "2026-11-03T12:00:00.000Z",
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/public/document-signatures/${first.token}`,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/document-signatures/${renewed.token}`,
          payload: { signerName: "Cliente", accepted: true, signatureImage },
        })
      ).statusCode,
    ).toBe(200);

    // Assinado, continua visível (só leitura) depois do prazo e o link não muda.
    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    const signedLater = await app.inject({
      method: "GET",
      url: `/public/document-signatures/${renewed.token}`,
    });
    expect(signedLater.statusCode).toBe(200);
    expect(signedLater.json().status).toBe("signed");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/documents/${document.id}/signature-link`,
          headers,
        })
      ).json().token,
    ).toBe(renewed.token);
  });

  it("limits requests to the public routes per IP", async () => {
    const { app } = await issuedDocument();
    const url = `/public/document-signatures/${"a".repeat(43)}`;
    for (let index = 0; index < 60; index += 1)
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
    const blocked = await app.inject({ method: "GET", url });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("TOO_MANY_REQUESTS");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    const payload = { signerName: "Cliente", accepted: true, signatureImage };
    const other = `/public/document-signatures/${"b".repeat(43)}`;
    for (let index = 0; index < 10; index += 1)
      expect(
        (await app.inject({ method: "POST", url: other, payload })).statusCode,
      ).toBe(404);
    expect(
      (await app.inject({ method: "POST", url: other, payload })).statusCode,
    ).toBe(429);
    // Outro IP continua liberado.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/public/document-signatures/${"c".repeat(43)}`,
          remoteAddress: "198.51.100.4",
          payload,
        })
      ).statusCode,
    ).toBe(404);
  });
});
