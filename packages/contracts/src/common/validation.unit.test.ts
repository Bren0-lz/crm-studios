import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ptBrValidationError, validationErrorMessage } from "./validation.js";

describe("validation messages in Brazilian Portuguese", () => {
  const invalidInputs: {
    schema: z.ZodType;
    value: unknown;
    message: string;
  }[] = [
    { schema: z.string(), value: undefined, message: "Preencha este campo." },
    { schema: z.string(), value: null, message: "Preencha este campo." },
    { schema: z.string(), value: 5, message: "Valor inválido." },
    { schema: z.string().min(1), value: "", message: "Preencha este campo." },
    {
      schema: z.string().min(3),
      value: "AB",
      message: "Use pelo menos 3 caracteres.",
    },
    {
      schema: z.string().max(2),
      value: "ABC",
      message: "Use no máximo 2 caracteres.",
    },
    {
      schema: z.array(z.string()).min(2),
      value: [],
      message: "Selecione pelo menos 2.",
    },
    {
      schema: z.array(z.string()).max(1),
      value: ["a", "b"],
      message: "Selecione no máximo 1.",
    },
    {
      schema: z.set(z.string()).min(1),
      value: new Set(),
      message: "Selecione pelo menos 1.",
    },
    {
      schema: z.set(z.string()).max(1),
      value: new Set(["a", "b"]),
      message: "Selecione no máximo 1.",
    },
    {
      schema: z.number().gt(0),
      value: 0,
      message: "Informe um valor maior que 0.",
    },
    {
      schema: z.number().min(1),
      value: 0,
      message: "Informe um valor a partir de 1.",
    },
    {
      schema: z.number().lt(5),
      value: 5,
      message: "Informe um valor menor que 5.",
    },
    {
      schema: z.number().max(5),
      value: 6,
      message: "Informe um valor de até 5.",
    },
    {
      schema: z.email(),
      value: "sem-arroba",
      message: "Informe um e-mail válido.",
    },
    {
      schema: z.iso.date(),
      value: "30/02",
      message: "Informe uma data válida.",
    },
    {
      schema: z.iso.datetime(),
      value: "11h30",
      message: "Informe uma data válida.",
    },
    {
      schema: z.iso.time(),
      value: "30h",
      message: "Informe um horário válido.",
    },
    { schema: z.uuid(), value: "clinica", message: "Seleção inválida." },
    {
      schema: z.string().regex(/^A/),
      value: "B",
      message: "Formato inválido.",
    },
    { schema: z.number().multipleOf(2), value: 3, message: "Valor inválido." },
    {
      schema: z.enum(["admin", "professional"]),
      value: "guest",
      message: "Opção inválida.",
    },
    {
      schema: z.union([z.number(), z.string()]),
      value: false,
      message: "Opção inválida.",
    },
    {
      schema: z.strictObject({}),
      value: { extra: true },
      message: "Valor inválido.",
    },
  ];

  it.each(invalidInputs)("returns $message", ({ schema, value, message }) => {
    const parsed = schema.safeParse(value, { error: ptBrValidationError });
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      message,
    ]);
  });

  it("keeps the message specified by the field", () => {
    const parsed = z.string("Informe a senha.").safeParse(undefined, {
      error: ptBrValidationError,
    });
    expect(parsed.error?.issues[0]?.message).toBe("Informe a senha.");
  });
});

describe("validationErrorMessage", () => {
  it("labels the full field path and combines its distinct messages", () => {
    const name = ["professional", "data", "fullName"];
    expect(
      validationErrorMessage([
        { path: name, message: "Informe o nome." },
        {
          path: ["professional", "data", "email"],
          message: "Informe o e-mail.",
        },
        { path: name, message: " Informe o nome. " },
        { path: name, message: "Use pelo menos 2 caracteres." },
        { path: name, message: " " },
      ]),
    ).toBe("Nome na agenda: Informe o nome. Use pelo menos 2 caracteres.");
  });

  it("uses the last known field name, including inside a list", () => {
    expect(
      validationErrorMessage([
        { path: ["users", 0, "email"], message: "Preencha este campo." },
      ]),
    ).toBe("E-mail: Preencha este campo.");
  });

  it("preserves a general error and falls back for missing messages", () => {
    expect(
      validationErrorMessage([
        { path: [], message: "Revise a combinação de datas." },
      ]),
    ).toBe("Revise a combinação de datas.");
    expect(validationErrorMessage([])).toBe("Revise os dados informados.");
    expect(validationErrorMessage([{ path: ["name"], message: " " }])).toBe(
      "Revise os dados informados.",
    );
  });
});
