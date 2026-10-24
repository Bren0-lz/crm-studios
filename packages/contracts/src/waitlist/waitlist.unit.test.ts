import { describe, expect, it } from "vitest";
import {
  waitlistDemand,
  waitlistEntryInputSchema,
  waitlistEntryUpdateSchema,
  waitlistPosition,
} from "./model.js";
import type { WaitlistEntry } from "./types.js";

const serviceId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";

function entry(
  id: string,
  createdAt: string,
  change: Partial<WaitlistEntry> = {},
): WaitlistEntry {
  return {
    id,
    clinicId: "c",
    patientId,
    patientName: "Cliente",
    patientPhone: "",
    kind: "service",
    serviceId,
    productId: null,
    itemName: "Pilates",
    status: "waiting",
    notes: "",
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    ...change,
  };
}

describe("lista de espera", () => {
  it("exige o item do tipo escolhido e descarta o do outro tipo", () => {
    expect(
      waitlistEntryInputSchema.safeParse({ patientId, kind: "service" })
        .success,
    ).toBe(false);
    expect(
      waitlistEntryInputSchema.safeParse({
        patientId,
        kind: "product",
        serviceId,
      }).success,
    ).toBe(false);
    expect(
      waitlistEntryInputSchema.parse({
        patientId,
        kind: "product",
        serviceId,
        productId,
        notes: "  avisar por WhatsApp ",
      }),
    ).toEqual({
      patientId,
      kind: "product",
      serviceId: null,
      productId,
      notes: "avisar por WhatsApp",
    });
    expect(waitlistEntryUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      waitlistEntryUpdateSchema.safeParse({ status: "served" }).success,
    ).toBe(true);
  });

  it("ordena a procura pela maior fila e, no empate, pela espera mais antiga", () => {
    const entries = [
      entry("a", "2026-10-01T10:00:00Z"),
      entry("b", "2026-10-02T10:00:00Z", { status: "contacted" }),
      entry("c", "2026-09-01T10:00:00Z", { status: "served" }),
      entry("d", "2026-10-03T10:00:00Z", {
        kind: "product",
        serviceId: null,
        productId,
        itemName: "Faixa",
      }),
      entry("e", "2026-09-15T10:00:00Z", {
        serviceId: "44444444-4444-4444-8444-444444444444",
        itemName: "Dançaterapia",
      }),
    ];
    expect(
      waitlistDemand(entries).map((item) => [
        item.itemName,
        item.total,
        item.waiting,
        item.contacted,
        item.oldestSince,
      ]),
    ).toEqual([
      ["Pilates", 2, 1, 1, "2026-10-01T10:00:00Z"],
      ["Dançaterapia", 1, 1, 0, "2026-09-15T10:00:00Z"],
      ["Faixa", 1, 1, 0, "2026-10-03T10:00:00Z"],
    ]);
  });

  it("calcula a posição só entre quem continua na fila do mesmo item", () => {
    const entries = [
      entry("a", "2026-10-01T10:00:00Z", { status: "served" }),
      entry("b", "2026-10-02T10:00:00Z"),
      entry("c", "2026-10-03T10:00:00Z", { status: "contacted" }),
      entry("d", "2026-09-01T10:00:00Z", {
        kind: "product",
        serviceId: null,
        productId,
      }),
    ];
    expect(entries.map((item) => waitlistPosition(item, entries))).toEqual([
      null,
      1,
      2,
      1,
    ]);
  });
});
