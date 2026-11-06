import {
  cpfMatchKey,
  emailMatchKey,
  phoneMatchKey,
  type LeadDuplicateMatch,
  type LeadInput,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";

type DuplicateContact = Pick<LeadInput, "phone" | "email" | "cpf">;

const contactKey = (input: DuplicateContact) =>
  JSON.stringify([
    phoneMatchKey(input.phone),
    emailMatchKey(input.email),
    cpfMatchKey(input.cpf),
  ]);

/**
 * Aviso não bloqueante (QM10) de telefone, e-mail ou CPF já cadastrado em outro registro.
 * Na edição, só checa de novo se o telefone, o e-mail ou o CPF mudaram.
 */
export function useLeadDuplicates(
  input: DuplicateContact,
  excludeLeadId?: string,
) {
  const [baselineContact] = useState(() => contactKey(input));
  const currentContact = contactKey(input);
  const [duplicates, setDuplicates] = useState<{
    key: string;
    matches: LeadDuplicateMatch[];
  } | null>(null);
  const matches = duplicates?.key === currentContact ? duplicates.matches : [];
  /** A checagem ainda precisa rodar para o contato atual. */
  const pending =
    currentContact !== baselineContact && duplicates?.key !== currentContact;
  /** Consulta a duplicidade; devolve `true` quando há aviso a mostrar. */
  async function check(): Promise<boolean> {
    if (!pending) return false;
    let found: LeadDuplicateMatch[] = [];
    try {
      const result = await api.leadDuplicates({
        phone: input.phone,
        email: input.email ?? "",
        cpf: input.cpf ?? "",
        excludeLeadId: excludeLeadId ?? "",
      });
      found = result?.matches ?? [];
    } catch {
      /* A checagem é só um aviso: se falhar, o cadastro segue. */
    }
    setDuplicates({ key: currentContact, matches: found });
    return found.length > 0;
  }
  return { matches, pending, check };
}
