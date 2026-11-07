import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_REGISTRATION_TAG,
  MISSING_CPF_TAG,
  MISSING_EMAIL_TAG,
  OVERDUE_PAYMENT_TAG,
  automaticPatientTagCategoryOf,
  needsCpf,
  isAutomaticPatientTag,
  lacksEmail,
  lacksRequiredContact,
  needsCompleteRegistration,
  needsEmail,
  isOverdueReceivable,
  overduePatientIds,
  withAutomaticPatientTags,
  withoutAutomaticPatientTags,
} from "./automatic-tags.js";

describe("etiqueta automática 'Pagamento atrasado'", () => {
  const today = "2026-10-18";

  it("considera vencida só a parcela em aberto com vencimento antes de hoje", () => {
    expect(
      isOverdueReceivable({ status: "open", dueDate: "2026-10-17" }, today),
    ).toBe(true);
    expect(isOverdueReceivable({ status: "open", dueDate: today }, today)).toBe(
      false,
    );
    expect(
      isOverdueReceivable({ status: "paid", dueDate: "2026-09-01" }, today),
    ).toBe(false);
    expect(
      isOverdueReceivable(
        { status: "cancelled", dueDate: "2026-09-01" },
        today,
      ),
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
      withAutomaticPatientTags(
        { id: "a", tags: ["Pilates"], cpf: "52998224725" },
        overdue,
      ).tags,
    ).toEqual(["Pilates", OVERDUE_PAYMENT_TAG]);
    expect(
      withAutomaticPatientTags(
        { id: "b", tags: ["Pilates", OVERDUE_PAYMENT_TAG], cpf: "52998224725" },
        overdue,
      ).tags,
    ).toEqual(["Pilates"]);
  });
});

describe("etiqueta automática 'Falta CPF'", () => {
  it("vale para cliente sem CPF que não foi mesclado", () => {
    expect(needsCpf({})).toBe(true);
    expect(needsCpf({ cpf: "" })).toBe(true);
    expect(needsCpf({ cpf: null })).toBe(true);
    expect(needsCpf({ cpf: "52998224725" })).toBe(false);
    expect(needsCpf({ mergedIntoPatientId: "outro" })).toBe(false);
  });

  it("entra sem CPF, sai com CPF e não depende do Financeiro", () => {
    expect(
      withAutomaticPatientTags(
        { id: "a", tags: ["Pilates", "falta cpf"] },
        null,
      ).tags,
    ).toEqual(["Pilates", MISSING_CPF_TAG]);
    expect(
      withAutomaticPatientTags(
        { id: "a", tags: ["Pilates", MISSING_CPF_TAG], cpf: "52998224725" },
        new Set(["a"]),
      ).tags,
    ).toEqual(["Pilates", OVERDUE_PAYMENT_TAG]);
    expect(
      withAutomaticPatientTags(
        { id: "a", tags: [OVERDUE_PAYMENT_TAG], cpf: "52998224725" },
        null,
      ).tags,
    ).toEqual([]);
  });

  it("é automática, com categoria própria", () => {
    expect(isAutomaticPatientTag("FALTA cpf")).toBe(true);
    expect(withoutAutomaticPatientTags(["Falta CPF", "Pilates"])).toEqual([
      "Pilates",
    ]);
    expect(automaticPatientTagCategoryOf(MISSING_CPF_TAG)).toBe("status");
    expect(automaticPatientTagCategoryOf(OVERDUE_PAYMENT_TAG)).toBe(
      "financial",
    );
    expect(automaticPatientTagCategoryOf("Pilates")).toBeUndefined();
  });
});

describe("etiquetas automáticas 'Cadastro incompleto' e 'Sem e-mail' (CD3)", () => {
  const complete = {
    whatsapp: "11999990000",
    emergencyContactName: "Ana",
    emergencyContactPhone: "11988880000",
    email: "cliente@example.com",
  };
  const imported = { importedAt: "2026-11-04T12:00:00.000Z" };

  it("detecta o contato que falta, sem olhar a origem", () => {
    expect(lacksRequiredContact(complete)).toBe(false);
    expect(lacksRequiredContact({ ...complete, whatsapp: "" })).toBe(true);
    expect(
      lacksRequiredContact({ ...complete, emergencyContactName: " " }),
    ).toBe(true);
    expect(
      lacksRequiredContact({ ...complete, emergencyContactPhone: null }),
    ).toBe(true);
    expect(lacksEmail(complete)).toBe(false);
    expect(lacksEmail({})).toBe(true);
  });

  it("valem só para cliente importado e não mesclado", () => {
    expect(needsCompleteRegistration({})).toBe(false);
    expect(needsEmail({})).toBe(false);
    expect(needsCompleteRegistration(imported)).toBe(true);
    expect(needsEmail(imported)).toBe(true);
    expect(
      needsCompleteRegistration({ ...imported, mergedIntoPatientId: "outro" }),
    ).toBe(false);
    expect(needsEmail({ ...imported, mergedIntoPatientId: "outro" })).toBe(
      false,
    );
    expect(needsCompleteRegistration({ ...imported, ...complete })).toBe(false);
    expect(needsEmail({ ...imported, ...complete })).toBe(false);
  });

  it("entram no importado sem os dados e saem quando são preenchidos", () => {
    const cpf = "52998224725";
    expect(
      withAutomaticPatientTags(
        { id: "a", tags: ["Pilates", "sem E-MAIL"], cpf, ...imported },
        null,
      ).tags,
    ).toEqual(["Pilates", INCOMPLETE_REGISTRATION_TAG, MISSING_EMAIL_TAG]);
    expect(
      withAutomaticPatientTags(
        {
          id: "a",
          tags: [INCOMPLETE_REGISTRATION_TAG, MISSING_EMAIL_TAG],
          cpf,
          ...imported,
          ...complete,
        },
        null,
      ).tags,
    ).toEqual([]);
    expect(
      withAutomaticPatientTags(
        {
          id: "a",
          tags: [INCOMPLETE_REGISTRATION_TAG],
          cpf,
          ...complete,
          email: "",
        },
        null,
      ).tags,
    ).toEqual([]);
  });

  it("são automáticas, com categoria", () => {
    expect(isAutomaticPatientTag("cadastro INCOMPLETO")).toBe(true);
    expect(isAutomaticPatientTag("Sem e-mail")).toBe(true);
    expect(
      withoutAutomaticPatientTags([
        "Cadastro incompleto",
        "Sem e-mail",
        "Pilates",
      ]),
    ).toEqual(["Pilates"]);
    expect(automaticPatientTagCategoryOf(INCOMPLETE_REGISTRATION_TAG)).toBe(
      "status",
    );
    expect(automaticPatientTagCategoryOf(MISSING_EMAIL_TAG)).toBe("status");
  });
});
