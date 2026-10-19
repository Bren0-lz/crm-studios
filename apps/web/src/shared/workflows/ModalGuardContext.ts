import { createContext, useContext, useEffect } from "react";

export type ModalGuard = {
  /** Fecha o modal, perguntando antes se o formulário foi alterado. */
  requestClose: () => void;
  /** Executa `proceed` direto, ou depois de "Descartar" se houver alteração. */
  confirmDiscard: (proceed: () => void) => void;
  /** Formulário dentro do modal avisa que está alterado. */
  registerDirty: () => () => void;
};

export const ModalGuardContext = createContext<ModalGuard | null>(null);

/** Formulário dentro de um `Modal` declara que tem alteração não salva. */
export function useModalDirty(dirty: boolean) {
  const register = useContext(ModalGuardContext)?.registerDirty;
  useEffect(() => {
    if (dirty && register) return register();
  }, [dirty, register]);
}

/**
 * Ação que abandona o formulário (Cancelar, Voltar): pergunta "Descartar
 * alterações?" quando o modal de cima tem alteração; senão segue direto.
 */
export function useConfirmDiscard() {
  const confirm = useContext(ModalGuardContext)?.confirmDiscard;
  return confirm ?? ((proceed: () => void) => proceed());
}
