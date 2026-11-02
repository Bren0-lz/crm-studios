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
  align: "start" | "end";
};

function viewBounds(viewport: ViewportBox, margin: number) {
  return {
    top: viewport.top + margin,
    bottom: viewport.top + viewport.height - margin,
    left: viewport.left + margin,
    right: viewport.left + viewport.width - margin,
  };
}

/**
 * Posiciona um painel flutuante (position: fixed) sempre logo abaixo do gatilho. A altura
 * máxima é o espaço até o fim da área visível (o painel rola por dentro) e depende só da
 * geometria do gatilho e da viewport — nunca da altura do painel —, para que rolar ou
 * carregar conteúdo não faça o painel pular de lugar. Alinha pela direita do gatilho
 * quando não cabe a partir da esquerda.
 */
export function computeFloatingPosition({
  trigger,
  panelWidth,
  viewport,
  margin = 8,
  gap = 4,
}: {
  trigger: Rect;
  panelWidth: number;
  viewport: ViewportBox;
  margin?: number;
  gap?: number;
}): FloatingPosition {
  const view = viewBounds(viewport, margin);
  const top = trigger.bottom + gap;
  const maxHeight = Math.max(0, view.bottom - Math.max(top, view.top));

  const width = Math.max(0, Math.min(panelWidth, view.right - view.left));
  const align = trigger.left + width <= view.right ? "start" : "end";
  const preferred = align === "start" ? trigger.left : trigger.right - width;
  const left = Math.min(Math.max(preferred, view.left), view.right - width);

  return { top, left, width, maxHeight, align };
}

/**
 * Quanto rolar o conteúdo para o painel (altura `panelHeight`) caber inteiro abaixo do
 * gatilho, sem empurrar o gatilho para fora do topo da área visível. 0 quando já cabe.
 */
export function scrollNeededBelow({
  trigger,
  panelHeight,
  viewport,
  margin = 8,
  gap = 4,
}: {
  trigger: Rect;
  panelHeight: number;
  viewport: ViewportBox;
  margin?: number;
  gap?: number;
}): number {
  const view = viewBounds(viewport, margin);
  const missing = trigger.bottom + gap + panelHeight - view.bottom;
  const room = trigger.top - view.top;
  return Math.max(0, Math.min(missing, room));
}
