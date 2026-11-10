import type { ReactNode } from "react";
import { AnimatedFieldset } from "../../shared/components/AnimatedFieldset";

/**
 * Bloco de um item do cadastro guiado (plano, serviço avulso, produto, aula experimental).
 * Ao ser adicionado, entra deslizando, fica realçado e rola até ficar visível; ao ser
 * removido, recolhe antes de sair da tela. Sem animação (movimento reduzido), sai na hora.
 */
export function GuidedItemFieldset({
  legend,
  onRemoved,
  children,
}: {
  legend: ReactNode;
  /** Remove de fato o item do estado, depois da animação de saída. */
  onRemoved: () => void;
  /** Recebe a função que inicia a remoção animada. */
  children: (remove: () => void) => ReactNode;
}) {
  return (
    <AnimatedFieldset legend={legend} className="span-2" onRemoved={onRemoved}>
      {children}
    </AnimatedFieldset>
  );
}
