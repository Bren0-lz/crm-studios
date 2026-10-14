import { describe, expect, it } from "vitest";
import { patientInputSchema, patientProfile } from "./model.js";
import { mergedPatientInput, patientMergeSchema } from "./management.js";
import type { Patient } from "./types.js";
describe("optional client profile", () => {
  it("keeps legacy registrations valid and rejects invalid new fields", () => {
    expect(
      patientInputSchema.parse({
        fullName: "Cliente antigo",
        phone: "11999998888",
      }),
    ).toMatchObject({ tags: [] });
    expect(patientProfile({ city: " São Paulo " })).toEqual({
      city: "São Paulo",
    });
    expect(
      patientInputSchema.safeParse({
        fullName: "Cliente",
        phone: "11999998888",
        gender: "invalid",
      }).success,
    ).toBe(false);
    expect(
      patientInputSchema.safeParse({
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
