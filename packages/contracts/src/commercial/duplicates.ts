import { z } from "zod";

/** Dado de contato comparado na checagem de duplicidade do lead. */
export type ContactDuplicateField = "phone" | "email" | "cpf";

/** Telefone só com dígitos e sem o DDI 55 (12 ou 13 dígitos começando com 55). */
export function phoneMatchKey(value: string | undefined | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") &&
    (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}

/** E-mail sem espaços e sem diferença de maiúsculas. */
export function emailMatchKey(value: string | undefined | null): string {
  return (value ?? "").replace(/\s/g, "").toLocaleLowerCase("pt-BR");
}

/** CPF só com dígitos. */
export function cpfMatchKey(value: string | undefined | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export const leadDuplicateQuerySchema = z.object({
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(254).optional(),
  cpf: z.string().trim().max(20).optional(),
  /** Lead em edição: não conta como duplicado de si mesmo. */
  excludeLeadId: z.uuid().optional().or(z.literal("")),
});
export type LeadDuplicateQuery = z.infer<typeof leadDuplicateQuerySchema>;

/** Cadastro (cliente ou outro lead) com o mesmo dado de contato: só id e nome. */
export interface LeadDuplicateMatch {
  kind: "patient" | "lead";
  id: string;
  fullName: string;
  fields: ContactDuplicateField[];
}

export interface ContactDuplicateCandidate {
  id: string;
  fullName: string;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  cpf?: string | null | undefined;
}

/** Campos de contato em que o candidato coincide com a consulta (comparação normalizada). */
export function matchingContactFields(
  query: LeadDuplicateQuery,
  candidate: ContactDuplicateCandidate,
): ContactDuplicateField[] {
  const fields: ContactDuplicateField[] = [];
  const phone = phoneMatchKey(query.phone);
  if (phone && phone === phoneMatchKey(candidate.phone)) fields.push("phone");
  const email = emailMatchKey(query.email);
  if (email && email === emailMatchKey(candidate.email)) fields.push("email");
  const cpf = cpfMatchKey(query.cpf);
  if (cpf && cpf === cpfMatchKey(candidate.cpf)) fields.push("cpf");
  return fields;
}

/** Clientes primeiro, depois leads; só quem coincide em algum campo. */
export function findLeadDuplicates(
  query: LeadDuplicateQuery,
  patients: ContactDuplicateCandidate[],
  leads: ContactDuplicateCandidate[],
): LeadDuplicateMatch[] {
  const matches: LeadDuplicateMatch[] = [];
  for (const [kind, list] of [
    ["patient", patients],
    ["lead", leads],
  ] as const)
    for (const candidate of list) {
      if (kind === "lead" && candidate.id === query.excludeLeadId) continue;
      const fields = matchingContactFields(query, candidate);
      if (fields.length)
        matches.push({
          kind,
          id: candidate.id,
          fullName: candidate.fullName,
          fields,
        });
    }
  return matches;
}

const fieldLabels: Record<ContactDuplicateField, [string, string]> = {
  phone: ["Telefone", "telefone"],
  email: ["E-mail", "e-mail"],
  cpf: ["CPF", "CPF"],
};

/**
 * Aviso neutro em gênero: "Telefone e e-mail já cadastrados para Maria Souza (cliente)."
 */
export function describeLeadDuplicate(match: LeadDuplicateMatch): string {
  const labels = match.fields.map((field, index) =>
    index === 0 ? fieldLabels[field][0] : fieldLabels[field][1],
  );
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`
      : labels[0];
  const verb = labels.length > 1 ? "já cadastrados" : "já cadastrado";
  const who = match.kind === "patient" ? "cliente" : "lead";
  return `${list} ${verb} para ${match.fullName} (${who}).`;
}
