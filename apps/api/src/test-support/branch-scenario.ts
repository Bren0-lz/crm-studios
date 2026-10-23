import type { BranchScope } from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";

export const SCENARIO_CLINIC_ID = "11111111-1111-4111-8111-111111111111";
export const SCENARIO_OWNER_ID = "22222222-2222-4222-8222-222222222222";

const only = (branchId: string): BranchScope => ({
  branchIds: [branchId],
  writeBranchId: branchId,
});

function nextWeekAt(hour: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Cenário de filiais rodado na memória e no PostgreSQL: cadastros, agenda, estoque, comercial
 * e financeiro gravados numa filial ficam fora da outra e entram no consolidado.
 */
export async function runBranchScenario(repository: ClinicRepository) {
  const clinicId = SCENARIO_CLINIC_ID;
  const actor = SCENARIO_OWNER_ID;
  const [matriz] = await repository.listBranches(clinicId);
  expect(matriz).toMatchObject({ name: "Matriz", isDefault: true });
  const centro = (await repository.saveBranch(clinicId, actor, {
    name: "Centro",
    phones: [
      { number: "(11) 3333-4444", label: "Recepção" },
      { number: "11987654321" },
    ],
    street: "Rua das Flores",
    city: "Campinas",
    state: "SP",
  }))!;
  const phones = [
    { number: "1133334444", label: "Recepção" },
    { number: "11987654321" },
  ];
  expect(centro.phones).toEqual(phones);
  expect(
    (await repository.listBranches(clinicId)).find(
      (branch) => branch.id === centro.id,
    ),
  ).toMatchObject({ phones, street: "Rua das Flores", state: "SP" });
  const inCentro = <T>(work: () => Promise<T>) =>
    repository.branchScope.run(only(centro.id), work);
  const inMatriz = <T>(work: () => Promise<T>) =>
    repository.branchScope.run(only(matriz!.id), work);

  const professional = await inCentro(() =>
    repository.createProfessional(clinicId, {
      fullName: "Dra. Centro",
      crefito: "CREFITO-3 999999-F",
      specialty: "Pilates",
      color: "#336699",
    }),
  );
  const room = await inCentro(() =>
    repository.createRoom(clinicId, { name: "Sala Centro", capacity: 1 }),
  );
  expect(professional.branchId).toBe(centro.id);
  expect(room.branchId).toBe(centro.id);
  expect(
    (await inMatriz(() => repository.listProfessionals(clinicId))).map(
      (item) => item.id,
    ),
  ).not.toContain(professional.id);
  expect(
    (await inCentro(() => repository.listProfessionals(clinicId))).map(
      (item) => item.id,
    ),
  ).toEqual([professional.id]);
  expect(
    (await repository.listProfessionals(clinicId)).map((item) => item.id),
  ).toContain(professional.id);

  const [patient] = await repository.listPatients(clinicId);
  const [service] = await repository.listServices(clinicId);
  const appointment = await inCentro(() =>
    repository.createAppointment(clinicId, {
      patientId: patient!.id,
      professionalId: professional.id,
      roomId: room.id,
      serviceId: service!.id,
      startsAt: nextWeekAt(13),
      visitType: "regular",
    }),
  );
  expect(appointment.branchId).toBe(centro.id);
  const from = new Date().toISOString();
  const to = nextWeekAt(23);
  expect(
    (await inMatriz(() => repository.listAppointments(clinicId, from, to))).map(
      (item) => item.id,
    ),
  ).not.toContain(appointment.id);
  expect(
    (await inCentro(() => repository.listAppointments(clinicId, from, to))).map(
      (item) => item.id,
    ),
  ).toEqual([appointment.id]);
  const [matrizRoom] = await inMatriz(() => repository.listRooms(clinicId));
  await expect(
    repository.createAppointment(clinicId, {
      patientId: patient!.id,
      professionalId: professional.id,
      roomId: matrizRoom!.id,
      serviceId: service!.id,
      startsAt: nextWeekAt(15),
      visitType: "regular",
    }),
  ).rejects.toMatchObject({ code: "BRANCH_MISMATCH" });

  // Mesmo SKU em filiais diferentes; repetido na mesma filial é recusado.
  const product = { name: "Faixa elástica", sku: "FX-1", unit: "un" };
  const prices = { costInCents: 500, salePriceInCents: 1500 };
  const centroProduct = await inCentro(() =>
    repository.createProduct(clinicId, actor, {
      ...product,
      ...prices,
      initialStock: 3,
      minimumStock: 0,
    }),
  );
  await inMatriz(() =>
    repository.createProduct(clinicId, actor, {
      ...product,
      ...prices,
      initialStock: 0,
      minimumStock: 0,
    }),
  );
  await expect(
    inCentro(() =>
      repository.createProduct(clinicId, actor, {
        ...product,
        ...prices,
        initialStock: 0,
        minimumStock: 0,
      }),
    ),
  ).rejects.toMatchObject({ code: "PRODUCT_SKU_EXISTS" });
  const matrizTab = await inMatriz(() =>
    repository.openPatientTab(clinicId, actor, { patientId: patient!.id }),
  );
  await expect(
    inMatriz(() =>
      repository.addPatientTabItem(clinicId, actor, matrizTab.id, {
        productId: centroProduct.id,
        quantity: 1,
      }),
    ),
  ).rejects.toMatchObject({ code: "BRANCH_MISMATCH" });
  const centroInventory = await inCentro(() =>
    repository.getInventoryWorkspace(clinicId),
  );
  expect(centroInventory.products.map((item) => item.id)).toEqual([
    centroProduct.id,
  ]);
  expect(centroInventory.tabs).toEqual([]);

  const receivable = await inCentro(() =>
    repository.createManualReceivable(clinicId, actor, {
      patientId: patient!.id,
      description: "Avaliação na filial Centro",
      amountInCents: 12_345,
      dueDate: nextWeekAt(12).slice(0, 10),
    }),
  );
  const ids = (summary: { receivables: { id: string }[] }) =>
    summary.receivables.map((item) => item.id);
  const centroSummary = await inCentro(() =>
    repository.getFinancialSummary(clinicId),
  );
  expect(ids(centroSummary)).toEqual([receivable.id]);
  expect(centroSummary.openInCents).toBe(12_345);
  expect(
    ids(await inMatriz(() => repository.getFinancialSummary(clinicId))),
  ).not.toContain(receivable.id);
  expect(ids(await repository.getFinancialSummary(clinicId))).toContain(
    receivable.id,
  );

  const lead = await inCentro(() =>
    repository.createLead(clinicId, {
      fullName: "Lead do Centro",
      phone: "11955554444",
      source: "Instagram",
      interest: "Pilates",
      tags: [],
    }),
  );
  expect(
    (await inMatriz(() => repository.listLeads(clinicId))).map(
      (item) => item.id,
    ),
  ).not.toContain(lead.id);
  expect(
    (await inCentro(() => repository.listLeads(clinicId))).map(
      (item) => item.id,
    ),
  ).toEqual([lead.id]);

  // A filial padrão não é desativada; nomes não se repetem.
  await expect(
    repository.saveBranch(
      clinicId,
      actor,
      { name: "Matriz", active: false },
      matriz!.id,
    ),
  ).rejects.toMatchObject({ code: "BRANCH_DEFAULT_INACTIVE" });
  await expect(
    repository.saveBranch(clinicId, actor, { name: "centro" }),
  ).rejects.toMatchObject({ code: "BRANCH_NAME_DUPLICATE" });
  return { matriz: matriz!, centro };
}
