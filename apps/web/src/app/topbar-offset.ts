import { useLayoutEffect, type RefObject } from "react";

/**
 * Altura do topo fixo à vista em `--topbar-offset` (no `<html>`), para quem fica preso ou
 * se mede abaixo dele (grade da Agenda, editor de modelos, listas laterais, avisos). O topo
 * cresce com a faixa de alertas: no computador os atalhos quebram em linhas (RF3); no celular
 * ele para com a faixa acima da tela (`top` negativo, RE11) e conta só a parte à vista (RV5).
 * Sem medição, vale o padrão de `:root` (60px).
 */
export function useTopbarOffset(topbarRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar) return;
    const root = document.documentElement;
    const update = () => {
      const top = Math.min(0, parseFloat(getComputedStyle(topbar).top) || 0);
      root.style.setProperty(
        "--topbar-offset",
        `${topbar.offsetHeight + top}px`,
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      return () => root.style.removeProperty("--topbar-offset");
    }
    // No quadro seguinte: o `top` depende da altura da faixa, medida por outro observador.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(topbar);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.style.removeProperty("--topbar-offset");
    };
  }, [topbarRef]);
}
