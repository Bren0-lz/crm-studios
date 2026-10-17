import { z } from "zod";

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

// Formato brasileiro com DDD: (11) 3333-4444 para fixo e (11) 99999-9999 para celular.
// Também formata valores parciais, para ser usado enquanto a pessoa digita.
export function formatPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${area}) ${number}`;
  const split = number.length === 9 ? 5 : 4;
  return `(${area}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function cpfDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

// Formata também valores parciais para uso durante a digitação.
export function formatCpf(value: string): string {
  const digits = cpfDigits(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string): boolean {
  const digits = cpfDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10])
  );
}

export function cnpjDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 14);
}

export function isValidCnpj(value: string): boolean {
  const digits = cnpjDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      const weight = ((length - 1 - index) % 8) + 2;
      sum += Number(digits[index]) * weight;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    checkDigit(12) === Number(digits[12]) &&
    checkDigit(13) === Number(digits[13])
  );
}

// CPF até 11 dígitos e CNPJ a partir do 12º; também formata valores parciais.
export function formatTaxId(value: string): string {
  const digits = cnpjDigits(value);
  if (digits.length <= 11) return formatCpf(digits);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) com os dígitos verificadores corretos. */
export function isValidTaxId(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine(
    (digits) => digits.length === 10 || digits.length === 11,
    "Informe o telefone com DDD.",
  );

export const optionalPhoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine(
    (digits) =>
      digits.length === 0 || digits.length === 10 || digits.length === 11,
    "Informe o telefone com DDD.",
  )
  .optional();

/** Parâmetro de query vazio (`param=`) conta como ausente. */
export const emptyQueryToUndefined = (value: unknown) =>
  value === "" || value === null ? undefined : value;

/** Lista separada por vírgula (ou parâmetro repetido); itens vazios são ignorados. */
export const queryList = (value: unknown) => {
  const parts = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parts.length > 0 ? parts : undefined;
};

export const queryBoolean = z.preprocess(
  emptyQueryToUndefined,
  z
    .enum(["true", "false"], "Use true ou false.")
    .transform((value) => value === "true")
    .optional(),
);

export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function joinWithAnd(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

export function addDaysToIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10);
}

export function addMonthsToIsoDate(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const lastDay = new Date(
    Date.UTC(year!, month! - 1 + months + 1, 0),
  ).getUTCDate();
  return new Date(Date.UTC(year!, month! - 1 + months, Math.min(day!, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/** Competência mensal no formato AAAA-MM. */
export const competenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM.");

/** Data de hoje (aaaa-mm-dd) no fuso da clínica (America/Sao_Paulo). */
export function saoPauloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const birthdayMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM.");

/** Link wa.me com o DDI 55; não duplica o 55 se o número já vier com ele. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const international =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits
      : `55${digits}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}
