import type { z } from "zod";

/**
 * Mensagens pt-BR para as regras padrão do zod (`z.config({ customError })`). Mensagens
 * escritas no próprio schema ("Informe a senha.") têm prioridade e não passam aqui.
 */
export function ptBrValidationError(issue: z.core.$ZodRawIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined || issue.input === null
        ? "Preencha este campo."
        : "Valor inválido.";
    case "too_small": {
      const minimum = Number(issue.minimum);
      if (issue.origin === "string")
        return minimum <= 1
          ? "Preencha este campo."
          : `Use pelo menos ${minimum} caracteres.`;
      if (issue.origin === "array" || issue.origin === "set")
        return `Selecione pelo menos ${minimum}.`;
      return issue.inclusive === false
        ? `Informe um valor maior que ${minimum}.`
        : `Informe um valor a partir de ${minimum}.`;
    }
    case "too_big": {
      const maximum = Number(issue.maximum);
      if (issue.origin === "string")
        return `Use no máximo ${maximum} caracteres.`;
      if (issue.origin === "array" || issue.origin === "set")
        return `Selecione no máximo ${maximum}.`;
      return issue.inclusive === false
        ? `Informe um valor menor que ${maximum}.`
        : `Informe um valor de até ${maximum}.`;
    }
    case "invalid_format":
      if (issue.format === "email") return "Informe um e-mail válido.";
      if (issue.format === "date" || issue.format === "datetime")
        return "Informe uma data válida.";
      if (issue.format === "time") return "Informe um horário válido.";
      if (issue.format === "uuid") return "Seleção inválida.";
      return "Formato inválido.";
    case "not_multiple_of":
      return "Valor inválido.";
    case "invalid_value":
    case "invalid_union":
      return "Opção inválida.";
    default:
      return "Valor inválido.";
  }
}

/** Nome do campo mostrado ao usuário; o caminho completo vence o último trecho. */
const fieldLabels: Record<string, string> = {
  "professional.data.fullName": "Nome na agenda",
  fullName: "Nome",
  name: "Nome",
  email: "E-mail",
  password: "Senha",
  currentPassword: "Senha atual",
  newPassword: "Nova senha",
  role: "Tipo",
  jobTitle: "Cargo",
  crefito: "Registro profissional",
  specialty: "Especialidade",
  color: "Cor",
  percentage: "Comissão (%)",
  effectiveFrom: "Vale a partir de",
  effectiveUntil: "Vale até",
  permissions: "Permissões",
  branchAccess: "Filiais",
  branchIds: "Filiais",
  phone: "Telefone",
  cpf: "CPF",
  birthDate: "Data de nascimento",
  notes: "Observações",
};

/**
 * Resume a validação que falhou numa frase para o usuário: o campo do primeiro problema e
 * todas as regras dele ("Comissão (%): Informe um valor de até 100.").
 */
export function validationErrorMessage(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  const first = issues[0];
  if (!first) return "Revise os dados informados.";
  const key = first.path.map(String).join(".");
  const messages = [
    ...new Set(
      issues
        .filter((issue) => issue.path.map(String).join(".") === key)
        .map((issue) => issue.message.trim())
        .filter(Boolean),
    ),
  ].join(" ");
  const last = [...first.path]
    .reverse()
    .find((part) => typeof part === "string");
  const label =
    fieldLabels[key] ??
    (typeof last === "string" ? fieldLabels[last] : undefined);
  if (!messages) return "Revise os dados informados.";
  return label ? `${label}: ${messages}` : messages;
}
