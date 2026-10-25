import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { api } from "../../api";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function openTabWithProduct(
  repository: Awaited<ReturnType<typeof setupApi>>["repository"],
) {
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Renata Figueiredo",
    phone: "11977776666",
    tags: [],
  });
  const product = await repository.createProduct(clinicId, actorId, {
    name: "Faixa terapêutica",
    sku: "FAIXA",
    unit: "un",
    costInCents: 1000,
    salePriceInCents: 2000,
    initialStock: 10,
  });
  const tab = await repository.openPatientTab(clinicId, actorId, {
    patientId: patient.id,
  });
  await repository.addPatientTabItem(clinicId, actorId, tab.id, {
    productId: product.id,
    quantity: 2,
  });
  return { patient, tab };
}

describe("dados atualizados sem recarregar após mutações (QC6)", () => {
  it("o contador de contas a receber acompanha a mutação feita fora da tela", async () => {
    const { repository } = await setupApi();
    const { tab } = await openTabWithProduct(repository);
    open("/financeiro");
    const counter = await screen.findByRole("button", {
      name: "Contas a receber (0)",
    });
    await act(async () => {
      await api.closePatientTab(tab.id, {
        settlement: "receivable",
        dueDate: "2026-10-30",
      });
    });
    expect(
      await screen.findByRole("button", { name: "Contas a receber (1)" }),
    ).toBe(counter);
  });
});
