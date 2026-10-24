import { waitlistDemand } from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { DomainError } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const waitlistClinicId = "11111111-1111-4111-8111-111111111111";
export const waitlistActorId = "22222222-2222-4222-8222-222222222222";
const otherClinicId = "99999999-9999-4999-8999-999999999999";

export async function verifyWaitlistRepository(repository: ClinicRepository) {
  const clinicId = waitlistClinicId,
    actor = waitlistActorId;
  const patient = (name: string) =>
    repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: name,
      phone: "11988887777",
      tags: [],
    });
  const ana = await patient("Ana Espera");
  const bruno = await patient("Bruno Espera");
  const [service] = await repository.listServices(clinicId);
  const product = await repository.createProduct(clinicId, actor, {
    name: "Faixa em falta",
    sku: `ESPERA-${nextTestCpf()}`,
    unit: "un",
    costInCents: 500,
    salePriceInCents: 1000,
    initialStock: 0,
    minimumStock: 1,
  });
  const first = await repository.createWaitlistEntry(clinicId, actor, {
    patientId: ana.id,
    kind: "service",
    serviceId: service!.id,
    productId: null,
    notes: "Prefere manhã",
  });
  expect(first).toMatchObject({
    patientName: "Ana Espera",
    patientPhone: "11988887777",
    itemName: service!.name,
    status: "waiting",
    notes: "Prefere manhã",
    resolvedAt: null,
  });
  await repository.createWaitlistEntry(clinicId, actor, {
    patientId: bruno.id,
    kind: "service",
    serviceId: service!.id,
    productId: null,
    notes: "",
  });
  const productEntry = await repository.createWaitlistEntry(clinicId, actor, {
    patientId: ana.id,
    kind: "product",
    serviceId: null,
    productId: product.id,
    notes: "",
  });
  expect(productEntry.itemName).toBe("Faixa em falta");

  // O mesmo cliente não entra duas vezes na fila do mesmo item.
  await expect(
    repository.createWaitlistEntry(clinicId, actor, {
      patientId: ana.id,
      kind: "service",
      serviceId: service!.id,
      productId: null,
      notes: "",
    }),
  ).rejects.toMatchObject({ code: "WAITLIST_DUPLICATE", statusCode: 409 });
  await expect(
    repository.createWaitlistEntry(clinicId, actor, {
      patientId: "33333333-3333-4333-8333-333333333333",
      kind: "service",
      serviceId: service!.id,
      productId: null,
      notes: "",
    }),
  ).rejects.toBeInstanceOf(DomainError);

  const mine = (await repository.listWaitlist(clinicId)).filter((item) =>
    [ana.id, bruno.id].includes(item.patientId),
  );
  expect(mine).toHaveLength(3);
  const demand = waitlistDemand(mine);
  expect(demand.map((item) => [item.itemName, item.total])).toEqual([
    [service!.name, 2],
    ["Faixa em falta", 1],
  ]);

  const contacted = await repository.updateWaitlistEntry(
    clinicId,
    actor,
    first.id,
    { status: "contacted" },
  );
  expect(contacted).toMatchObject({ status: "contacted", resolvedAt: null });
  const served = await repository.updateWaitlistEntry(
    clinicId,
    actor,
    first.id,
    { status: "served", notes: "Entrou na turma de terça" },
  );
  expect(served).toMatchObject({
    status: "served",
    notes: "Entrou na turma de terça",
  });
  expect(served!.resolvedAt).not.toBeNull();
  // Fora da fila, pode voltar a entrar.
  const again = await repository.createWaitlistEntry(clinicId, actor, {
    patientId: ana.id,
    kind: "service",
    serviceId: service!.id,
    productId: null,
    notes: "",
  });

  // Outra clínica não enxerga nem altera as entradas.
  expect(await repository.listWaitlist(otherClinicId)).toEqual([]);
  expect(
    await repository.updateWaitlistEntry(otherClinicId, actor, again.id, {
      status: "cancelled",
    }),
  ).toBeNull();
  expect(await repository.deleteWaitlistEntry(otherClinicId, again.id)).toBe(
    false,
  );

  for (const entry of [again, productEntry, served!])
    expect(await repository.deleteWaitlistEntry(clinicId, entry.id)).toBe(true);
  expect(
    (await repository.listWaitlist(clinicId)).filter(
      (item) => item.patientId === ana.id,
    ),
  ).toEqual([]);
  return { patients: [ana.id, bruno.id], productId: product.id };
}
