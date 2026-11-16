import type {
  ClinicBranding,
  DocumentTemplate,
  IssuedDocumentInput,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";

/** Modelo escolhido num cadastro para o cliente assinar pelo link. */
export type SignatureRequest = { templateId: string; title: string };

/** Emitir o documento e gerar o link exige as mesmas permissões do "Enviar pelo WhatsApp". */
export function useCanRequestSignature() {
  const { can } = useAuthorization();
  return can("contracts.issue") && can("contracts.status");
}

export type SignatureTemplatesState = {
  templates: DocumentTemplate[] | null;
  error: string;
  /** Dados da clínica: modelo que usa CNPJ, endereço… sem cadastro não é oferecido (E6). */
  clinic?: ClinicBranding | null;
};

/**
 * Carrega os modelos e os dados da clínica uma vez ao abrir o cadastro (só para quem pode
 * emitir). Sem os dados da clínica, a API continua recusando o contrato incompleto.
 */
export function useSignatureTemplates(enabled: boolean) {
  const [state, setState] = useState<SignatureTemplatesState>({
    templates: null,
    error: "",
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([
      api.documentTemplates(),
      api.clinicBranding().catch(() => null),
    ])
      .then(
        ([items, clinic]) =>
          active &&
          setState({
            templates: items.filter((item) => item.active),
            error: "",
            clinic,
          }),
      )
      .catch(
        (cause: Error) =>
          active && setState({ templates: [], error: cause.message }),
      );
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

/** Cria o documento a partir do modelo e já o emite (passa a aceitar o link de assinatura). */
export async function issueDocumentForSignature(input: IssuedDocumentInput) {
  const draft = await api.createDocument(input);
  return api.updateDocumentStatus(draft.id, "issued");
}
