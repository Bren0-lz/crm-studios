import type { PermissionKey } from "@crm/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { verifyTrashFinance } from "../../test-support/trash-finance-suite.js";
import {
  trashActorId as ownerId,
  trashClinicId as clinicId,
  verifyTrashRepository,
} from "../../test-support/trash-suite.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(permissions: PermissionKey[]) {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const user = await repository.createAdminUser(
    clinicId,
    ownerId,
    {
      fullName: "Recepção",
      email: "recepcao@example.com",
      password: "Password123",
      role: "user",
      permissions,
    },
    "unused-hash",
  );
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
  };
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Diana Lixeira",
    phone: "11977776666",
    tags: [],
  });
  return { app, repository, headers, patient };
}

describe("lixeira", () => {
  it("separa, restaura e exclui de vez no armazenamento em memória", async () => {
    await verifyTrashRepository(new MemoryClinicRepository());
  });

  it("tira o financeiro do cliente na lixeira dos relatórios e do Financeiro", async () => {
    await verifyTrashFinance(new MemoryClinicRepository());
  });

  it("enviar exige trash.send e a área; ver, restaurar e excluir exigem trash.view", async () => {
    const { app, headers, patient } = await setup([
      "patients.view",
      "trash.send",
    ]);
    const send = await app.inject({
      method: "POST",
      url: `/trash/patients/${patient.id}`,
      headers,
    });
    expect(send.statusCode).toBe(201);
    expect(send.json()).toMatchObject({ id: patient.id, kind: "patients" });
    const list = await app.inject({
      method: "GET",
      url: "/trash/patients",
      headers,
    });
    expect(list.statusCode).toBe(403);
    expect(list.json().details.permission).toBe("trash.view");
    const otherArea = await app.inject({
      method: "POST",
      url: `/trash/leads/${patient.id}`,
      headers,
    });
    expect(otherArea.statusCode).toBe(403);
    expect(otherArea.json().details.permission).toBe("crm.view");
    const clients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    expect(
      (clients.json() as { id: string }[]).map((item) => item.id),
    ).not.toContain(patient.id);
  });

  it("lista, mostra o impacto, restaura e só exclui de vez com a confirmação", async () => {
    const { app, headers, patient, repository } = await setup([
      "patients.view",
      "trash.view",
    ]);
    const send = await app.inject({
      method: "POST",
      url: `/trash/patients/${patient.id}`,
      headers,
    });
    expect(send.statusCode).toBe(403);
    expect(send.json().details.permission).toBe("trash.send");
    await repository.sendToTrash(clinicId, ownerId, "patients", patient.id);
    const list = await app.inject({
      method: "GET",
      url: "/trash/patients",
      headers,
    });
    expect(list.json()).toEqual([
      expect.objectContaining({ id: patient.id, title: "Diana Lixeira" }),
    ]);
    const impact = await app.inject({
      method: "GET",
      url: `/trash/patients/${patient.id}/impact`,
      headers,
    });
    expect(impact.json()).toMatchObject({ id: patient.id, total: 0 });
    const unconfirmed = await app.inject({
      method: "DELETE",
      url: `/trash/patients/${patient.id}`,
      headers,
      payload: { confirmation: "sim" },
    });
    expect(unconfirmed.statusCode).toBe(400);
    const restore = await app.inject({
      method: "POST",
      url: `/trash/patients/${patient.id}/restore`,
      headers,
    });
    expect(restore.statusCode).toBe(204);
    expect(await repository.getPatient(clinicId, patient.id)).toMatchObject({
      id: patient.id,
    });
    await repository.sendToTrash(clinicId, ownerId, "patients", patient.id);
    const purge = await app.inject({
      method: "DELETE",
      url: `/trash/patients/${patient.id}`,
      headers,
      payload: { confirmation: "EXCLUIR" },
    });
    expect(purge.statusCode).toBe(204);
    expect(
      (await repository.listAdminAuditEvents(clinicId)).map(
        (item) => item.action,
      ),
    ).toEqual(
      expect.arrayContaining([
        "patient.trashed",
        "patient.restored",
        "patient.purged",
      ]),
    );
    const invalid = await app.inject({
      method: "GET",
      url: "/trash/clinicas",
      headers,
    });
    expect(invalid.statusCode).toBe(400);
  });
});
