export type Rect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type ViewportBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type FloatingPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
  align: "start" | "end";
};

/**
 * Posiciona um painel flutuante (position: fixed) junto ao gatilho sem nunca sair da
 * área visível: abre para baixo quando cabe, para cima quando há mais espaço acima, e
 * alinha pela direita do gatilho quando não cabe a partir da esquerda. Se nenhum lado
 * comporta o painel inteiro, limita a altura (o painel rola por dentro).
 */
export function computeFloatingPosition({
  trigger,
  panel,
  viewport,
  margin = 8,
  gap = 4,
}: {
  trigger: Rect;
  panel: { width: number; height: number };
  viewport: ViewportBox;
  margin?: number;
  gap?: number;
}): FloatingPosition {
  const viewTop = viewport.top + margin;
  const viewBottom = viewport.top + viewport.height - margin;
  const viewLeft = viewport.left + margin;
  const viewRight = viewport.left + viewport.width - margin;

  const below = Math.max(0, viewBottom - trigger.bottom - gap);
  const above = Math.max(0, trigger.top - gap - viewTop);
  const placement =
    panel.height <= below || below >= above ? "below" : "above";
  const space = placement === "below" ? below : above;
  const maxHeight = Math.max(0, Math.min(space, viewBottom - viewTop));
  const height = Math.min(panel.height, maxHeight);
  const top =
    placement === "below"
      ? Math.max(viewTop, trigger.bottom + gap)
      : Math.max(viewTop, trigger.top - gap - height);

  const width = Math.max(0, Math.min(panel.width, viewRight - viewLeft));
  const align = trigger.left + width <= viewRight ? "start" : "end";
  const preferred = align === "start" ? trigger.left : trigger.right - width;
  const left = Math.min(Math.max(preferred, viewLeft), viewRight - width);

  return { top, left, width, maxHeight, placement, align };
}
