import { describe, expect, it } from "vitest";
import {
  applyPatientDiscount,
  discountedInstallments,
  patientDiscountRemaining,
  patientDiscountSchema,
  samePatientDiscount,
  patientDefaultExportColumns,
  patientExportColumnLabels,
  patientExportColumns,
  patientExportFilterSchema,
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
        whatsapp: "11999998888",
        emergencyContactName: "Cliente",
        emergencyContactPhone: "11999998888",
        emergencyContactWhatsapp: "11999998888",
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
        whatsapp: "11999998888",
        emergencyContactName: "Cliente antigo",
        emergencyContactPhone: "11999998888",
        emergencyContactWhatsapp: "11999998888",
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
        whatsapp: "11999998888",
        emergencyContactName: "Cliente",
        emergencyContactPhone: "11999998888",
        emergencyContactWhatsapp: "11999998888",
        gender: "invalid",
      }).success,
    ).toBe(false);
    expect(
      patientInputSchema.safeParse({
        cpf: "52998224725",
        fullName: "Cliente",
        phone: "11999998888",
        whatsapp: "11999998888",
        emergencyContactName: "Cliente",
        emergencyContactPhone: "11999998888",
        emergencyContactWhatsapp: "11999998888",
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
  const percent = (value: number) =>
    ({ type: "percentage", percent: value, scope: "permanent" }) as const;
  const amount = (value: number) =>
    ({ type: "amount", amountInCents: value, scope: "permanent" }) as const;

  it("applies a percentage or amount without going below zero", () => {
    expect(applyPatientDiscount(10000, undefined)).toBe(10000);
    expect(applyPatientDiscount(10000, null)).toBe(10000);
    expect(applyPatientDiscount(10000, percent(15))).toBe(8500);
    expect(applyPatientDiscount(10000, percent(12.5))).toBe(8750);
    expect(applyPatientDiscount(10000, amount(2500))).toBe(7500);
    expect(applyPatientDiscount(1000, amount(2500))).toBe(0);
  });

  it("keeps the discount out of the export columns", () => {
    expect(patientExportColumns).not.toContain("discount");
    expect(patientProfile({ discount: amount(500) })).toEqual({
      discount: amount(500),
    });
    expect(patientDiscountSchema.safeParse(percent(101)).success).toBe(false);
    expect(patientDiscountSchema.safeParse(percent(12.345)).success).toBe(
      false,
    );
  });

  it("offers the lead origin as an optional export column", () => {
    expect(patientExportColumns).toContain("leadOrigin");
    expect(patientDefaultExportColumns).not.toContain("leadOrigin");
    expect(patientExportColumnLabels.leadOrigin).toBe("Origem: evento/lead");
    expect(
      patientExportFilterSchema.parse({ columns: "leadOrigin,fullName" })
        .columns,
    ).toEqual(["fullName", "leadOrigin"]);
  });

  it("validates the scope: next needs the number of charges", () => {
    expect(
      patientDiscountSchema.safeParse({ ...percent(10), scope: "next" }).error
        ?.issues[0]?.message,
    ).toBe("Informe quantas cobranças recebem o desconto.");
    expect(
      patientDiscountSchema.safeParse({
        ...percent(10),
        scope: "next",
        charges: 3,
      }).success,
    ).toBe(true);
    expect(
      patientDiscountSchema.safeParse({ type: "percentage", percent: 10 })
        .success,
    ).toBe(false);
  });

  it("applies the discount only while the scope allows", () => {
    const schedule = [10000, 10000, 10000, 10000].map((amountInCents) => ({
      amountInCents,
    }));
    const once = discountedInstallments(schedule, {
      ...percent(10),
      scope: "once",
    });
    expect(once.installments.map((item) => item.amountInCents)).toEqual([
      9000, 10000, 10000, 10000,
    ]);
    expect(once.usedCharges).toBe(1);
    // Duas das três cobranças já foram usadas: sobra uma.
    const next = discountedInstallments(schedule, {
      ...amount(1500),
      scope: "next",
      charges: 3,
      usedCharges: 2,
    });
    expect(
      next.installments.map((item) => item.customerDiscountInCents),
    ).toEqual([1500, 0, 0, 0]);
    expect(
      discountedInstallments(schedule, percent(10)).installments.map(
        (item) => item.amountInCents,
      ),
    ).toEqual([9000, 9000, 9000, 9000]);
    expect(patientDiscountRemaining(percent(10))).toBe(Infinity);
    expect(
      patientDiscountRemaining({
        ...percent(10),
        scope: "once",
        usedCharges: 1,
      }),
    ).toBe(0);
  });

  it("compares the configuration without the used charges", () => {
    expect(
      samePatientDiscount(
        { ...percent(10), scope: "next", charges: 3, usedCharges: 2 },
        { ...percent(10), scope: "next", charges: 3 },
      ),
    ).toBe(true);
    expect(samePatientDiscount(percent(10), percent(15))).toBe(false);
    expect(samePatientDiscount(percent(10), amount(1000))).toBe(false);
    expect(samePatientDiscount(null, undefined)).toBe(true);
  });
});
