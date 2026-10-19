import { useCallback, useState } from "react";

/**
 * Compara o valor atual do formulário com o inicial. Voltar ao valor original
 * conta como intacto. Com `ready` falso (dados ainda carregando ou modal
 * fechado), o valor de referência só é registrado quando o formulário fica
 * pronto/aberto.
 */
export function useFormDirty(value: unknown, ready = true) {
  const current = JSON.stringify(value);
  const [baseline, setBaseline] = useState<string | null>(
    ready ? current : null,
  );
  // Formulário que fecha e reabre (estado fora do modal): nova referência a cada abertura.
  if (ready && baseline === null) setBaseline(current);
  if (!ready && baseline !== null) setBaseline(null);
  return ready && baseline !== null && current !== baseline;
}

/**
 * Intercepta o fechamento de um formulário alterado: em vez de fechar, deixa
 * pendente a pergunta "Descartar alterações?" (o `Modal` a exibe). Formulário
 * intacto fecha direto; durante o salvamento nada fecha.
 */
export function useDirtyGuard({
  dirty,
  busy = false,
  onClose,
}: {
  dirty: boolean;
  busy?: boolean;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<{ proceed: () => void } | null>(null);
  const confirmDiscard = useCallback(
    (proceed: () => void) => {
      if (busy) return;
      if (dirty) setPending({ proceed });
      else proceed();
    },
    [busy, dirty],
  );
  const requestClose = useCallback(
    () => confirmDiscard(onClose),
    [confirmDiscard, onClose],
  );
  return {
    requestClose,
    confirmDiscard,
    asking: Boolean(pending),
    discard: () => {
      setPending(null);
      pending?.proceed();
    },
    keepEditing: () => setPending(null),
  };
}
