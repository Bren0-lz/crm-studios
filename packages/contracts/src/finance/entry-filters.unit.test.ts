import { describe, expect, it } from "vitest";
import {
  financialEntryFilterSchema,
  matchesFinancialEntry,
} from "./entry-filters.js";
describe("financial entry filters", () => {
  it("distinguishes cash availability, payment and competence in the clinic timezone", () => {
    const entry = {
      description: "Pagamento de sessão",
      status: "paid",
      createdAt: "2039-06-01T01:00:00Z",
      dueDate: "2039-06-10",
      paidAt: "2039-06-10T01:30:00Z",
      cashAvailableAt: "2039-06-12T12:00:00Z",
      competence: "2039-05",
      paymentMethod: "pix",
      overdue: false,
    };
    expect(
      matchesFinancialEntry(
        entry,
        financialEntryFilterSchema.parse({
          dateField: "paidAt",
          from: "2039-06-09",
          to: "2039-06-09",
        }),
      ),
    ).toBe(true);
    expect(
      matchesFinancialEntry(
        entry,
        financialEntryFilterSchema.parse({
          dateField: "paidAt",
          from: "2039-06-10",
        }),
      ),
    ).toBe(false);
    expect(
      matchesFinancialEntry(
        entry,
        financialEntryFilterSchema.parse({
          dateField: "cashAvailableAt",
          from: "2039-06-12",
          to: "2039-06-12",
          competence: "2039-05",
          search: "sessao",
          paymentMethod: "pix",
        }),
      ),
    ).toBe(true);
    expect(
      matchesFinancialEntry(
        entry,
        financialEntryFilterSchema.parse({ competence: "2039-06" }),
      ),
    ).toBe(false);
    expect(
      matchesFinancialEntry(
        { ...entry, paidAt: undefined },
        financialEntryFilterSchema.parse({
          dateField: "paidAt",
          from: "2039-06-01",
        }),
      ),
    ).toBe(false);
    expect(
      financialEntryFilterSchema.safeParse({
        from: "2039-07-01",
        to: "2039-06-30",
      }).success,
    ).toBe(false);
  });
});
