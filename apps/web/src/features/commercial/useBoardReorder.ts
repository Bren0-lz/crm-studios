import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface Snapshot {
  scrollLeft: number;
  lefts: Map<string, number>;
}

const REORDER_MS = 220;

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Troca de ordem das colunas do funil sem pulo na rolagem e com animação (FLIP).
 * Chame `capture()` logo antes de mudar a ordem: ele guarda a rolagem e a posição de cada
 * coluna e desliga o encaixe (scroll-snap) — senão o navegador "segue" a coluna encaixada
 * até o novo lugar. Depois da troca, a rolagem volta para onde estava e cada coluna desliza
 * da posição antiga até a nova.
 */
export function useBoardReorder(order: unknown) {
  const boardRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Snapshot | null>(null);
  const [reordering, setReordering] = useState(false);

  const capture = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    pending.current = {
      scrollLeft: board.scrollLeft,
      lefts: new Map(
        [...board.querySelectorAll<HTMLElement>(".kanban-column")].map(
          (column) => [
            column.dataset.stage ?? "",
            column.getBoundingClientRect().left,
          ],
        ),
      ),
    };
    setReordering(true);
  }, []);

  useLayoutEffect(() => {
    const snapshot = pending.current;
    const board = boardRef.current;
    if (!snapshot) return;
    pending.current = null;
    if (!board) {
      queueMicrotask(() => setReordering(false));
      return;
    }
    board.scrollLeft = snapshot.scrollLeft;
    const animations = reducedMotion()
      ? []
      : [...board.querySelectorAll<HTMLElement>(".kanban-column")].flatMap(
          (column) => {
            const before = snapshot.lefts.get(column.dataset.stage ?? "");
            const delta =
              before === undefined
                ? 0
                : before - column.getBoundingClientRect().left;
            if (!delta || typeof column.animate !== "function") return [];
            return [
              column.animate(
                [
                  { transform: `translateX(${delta}px)` },
                  { transform: "translateX(0)" },
                ],
                { duration: REORDER_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
              ),
            ];
          },
        );
    void Promise.all(
      animations.map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => setReordering(false));
  }, [order]);

  return { boardRef, reordering, capture };
}
