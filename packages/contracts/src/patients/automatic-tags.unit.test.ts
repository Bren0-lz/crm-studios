import { describe, expect, it } from "vitest";
import {
  OVERDUE_PAYMENT_TAG,
  isAutomaticPatientTag,
  isOverdueReceivable,
  overduePatientIds,
  withAutomaticPatientTags,
  withoutAutomaticPatientTags,
} from "./automatic-tags.js";

describe("etiqueta automática 'Pagamento atrasado'", () => {
  const today = "2026-10-18";

  it("considera vencida só a parcela em aberto com vencimento antes de hoje", () => {
    expect(isOverdueReceivable({ status: "open", dueDate: "2026-10-17" }, today)).toBe(true);
    expect(isOverdueReceivable({ status: "open", dueDate: today }, today)).toBe(false);
    expect(isOverdueReceivable({ status: "paid", dueDate: "2026-09-01" }, today)).toBe(false);
    expect(
      isOverdueReceivable({ status: "cancelled", dueDate: "2026-09-01" }, today),
    ).toBe(false);
  });

  it("lista cada cliente com parcela vencida uma única vez", () => {
    expect(
      overduePatientIds(
        [
          { patientId: "a", status: "open", dueDate: "2026-10-01" },
          { patientId: "a", status: "open", dueDate: "2026-09-01" },
          { patientId: "b", status: "paid", dueDate: "2026-09-01" },
          { patientId: "c", status: "open", dueDate: "2026-10-20" },
        ],
        today,
      ),
    ).toEqual(["a"]);
  });

  it("reconhece a etiqueta sem diferenciar acentos e maiúsculas e a tira da lista manual", () => {
    expect(isAutomaticPatientTag("pagamento ATRASADO")).toBe(true);
    expect(isAutomaticPatientTag("Pilates")).toBe(false);
    expect(
      withoutAutomaticPatientTags(["Pilates", "pagamento atrasado"]),
    ).toEqual(["Pilates"]);
  });

  it("acrescenta a etiqueta só a quem está em atraso e descarta a cópia gravada", () => {
    const overdue = new Set(["a"]);
    expect(
      withAutomaticPatientTags({ id: "a", tags: ["Pilates"] }, overdue).tags,
    ).toEqual(["Pilates", OVERDUE_PAYMENT_TAG]);
    expect(
      withAutomaticPatientTags(
        { id: "b", tags: ["Pilates", OVERDUE_PAYMENT_TAG] },
        overdue,
      ).tags,
    ).toEqual(["Pilates"]);
  });
});
