import { describe, expect, it } from "vitest";
import {
  applyPatientDiscount,
  patientDiscountSchema,
  patientExportColumns,
  patientInputSchema,
  patientProfile,
} from "./model.js";
import { mergedPatientInput, patientMergeSchema } from "./management.js";
import type { Patient } from "./types.js";
describe("optional client profile", () => {
  it.each([undefined, null, "", "   ", "11111111111", "52998224724"])(
    "rejects a registration with CPF %s",
    (cpf) => {
      const result = patientInputSchema.safeParse({
        fullName: "Cliente",
        phone: "11999998888",
        cpf,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ["cpf"],
            message: "Informe um CPF válido.",
          }),
        );
    },
  );
  it("accepts a complete registration and rejects invalid profile fields", () => {
    expect(
      patientInputSchema.parse({
        cpf: "52998224725",
        fullName: "Cliente antigo",
        phone: "11999998888",
      }),
    ).toMatchObject({ tags: [] });
    expect(patientProfile({ city: " São Paulo " })).toEqual({
      city: "São Paulo",
    });
    expect(
      patientInputSchema.safeParse({
        cpf: "52998224725",
        fullName: "Cliente",
        phone: "11999998888",
        gender: "invalid",
      }).success,
    ).toBe(false);
    expect(
      patientInputSchema.safeParse({
        cpf: "52998224725",
        fullName: "Cliente",
        phone: "11999998888",
        guardianPhone: "12",
      }).success,
    ).toBe(false);
  });
  it("rejects merging a client into itself and combines interests without duplicates", () => {
    const source = {
      id: "11111111-1111-4111-8111-111111111111",
      fullName: "Origem",
      phone: "11988887777",
      tags: ["vip"],
      interests: ["Postura"],
    } as Patient;
    const target = {
      cpf: "52998224725",
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Destino",
      phone: "11999998888",
      tags: ["vip", "pilates"],
      interests: ["Postura", "Reabilitação"],
    } as Patient;
    expect(
      patientMergeSchema.safeParse({
        sourceId: source.id,
        targetId: source.id,
        fieldSources: {},
      }).success,
    ).toBe(false);
    expect(mergedPatientInput(source, target, {})).toMatchObject({
      fullName: "Destino",
      tags: ["vip", "pilates"],
      interests: ["Postura", "Reabilitação"],
    });
  });
});

describe("client discount", () => {
  it("applies a percentage or amount without going below zero", () => {
    expect(applyPatientDiscount(10000, undefined)).toBe(10000);
    expect(applyPatientDiscount(10000, null)).toBe(10000);
    expect(
      applyPatientDiscount(10000, { type: "percentage", percent: 15 }),
    ).toBe(8500);
    expect(
      applyPatientDiscount(10000, { type: "percentage", percent: 12.5 }),
    ).toBe(8750);
    expect(
      applyPatientDiscount(10000, { type: "amount", amountInCents: 2500 }),
    ).toBe(7500);
    expect(
      applyPatientDiscount(1000, { type: "amount", amountInCents: 2500 }),
    ).toBe(0);
  });

  it("keeps the discount out of the export columns", () => {
    expect(patientExportColumns).not.toContain("discount");
    expect(
      patientProfile({ discount: { type: "amount", amountInCents: 500 } }),
    ).toEqual({ discount: { type: "amount", amountInCents: 500 } });
    expect(
      patientDiscountSchema.safeParse({ type: "percentage", percent: 101 })
        .success,
    ).toBe(false);
  });
});
