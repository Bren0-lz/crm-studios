import { type ReactNode, useEffect, useRef, useState } from "react";

/** Animação permitida: o navegador existe e o usuário não pediu movimento reduzido. */
function motionAllowed() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  );
}

/** Tempo máximo da saída: remove o bloco mesmo se `animationend` não chegar. */
const leaveFallbackMs = 400;

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
  const ref = useRef<HTMLFieldSetElement>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !motionAllowed()) return;
    element.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, []);
  // Garantia: sem `animationend` (aba em segundo plano), remove assim mesmo.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onRemoved, leaveFallbackMs);
    return () => window.clearTimeout(timer);
  }, [leaving, onRemoved]);
  function remove() {
    if (leaving) return;
    if (!motionAllowed()) return onRemoved();
    setLeaving(true);
  }
  return (
    <fieldset
      ref={ref}
      className={`form-fieldset span-2 guided-item${leaving ? " guided-item-leaving" : ""}`}
      aria-hidden={leaving || undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && leaving) onRemoved();
      }}
    >
      <legend>{legend}</legend>
      {children(remove)}
    </fieldset>
  );
}
