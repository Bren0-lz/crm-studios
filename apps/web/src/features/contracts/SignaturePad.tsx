import { useCallback, useEffect, useRef, type PointerEvent } from "react";

/** Ponto do traço em fração da área (0–1): o desenho acompanha a área quando ela muda de tamanho. */
type Point = { x: number; y: number };

/** Teto da densidade: em telas 3x o PNG ficaria grande sem ganho visível na assinatura. */
const maxPixelRatio = 2;

/** Área para desenhar a assinatura com o dedo, a caneta ou o mouse. */
export function SignaturePad({
  disabled,
  onChange,
}: {
  disabled: boolean;
  onChange: (image: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const activePointer = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const context = useCallback(() => {
    const canvas = canvasRef.current;
    const drawing = canvas?.getContext("2d");
    return canvas && drawing ? { canvas, drawing } : null;
  }, []);

  /** Ajusta a resolução interna ao tamanho na tela e redesenha o que já foi assinado. */
  const fit = useCallback(() => {
    const current = context();
    if (!current) return;
    const { canvas, drawing } = current;
    const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === width && canvas.height === height) return;
    // Trocar o tamanho apaga o canvas e zera a escala.
    canvas.width = width;
    canvas.height = height;
    drawing.scale(ratio, ratio);
    drawing.lineWidth = 2.5;
    drawing.lineCap = "round";
    drawing.lineJoin = "round";
    drawing.strokeStyle = "#1f2a37";
    const box = { width: canvas.clientWidth, height: canvas.clientHeight };
    for (const stroke of strokes.current) {
      const [first, ...rest] = stroke;
      if (!first) continue;
      drawing.beginPath();
      drawing.moveTo(first.x * box.width, first.y * box.height);
      drawing.lineTo(first.x * box.width + 0.1, first.y * box.height + 0.1);
      for (const point of rest)
        drawing.lineTo(point.x * box.width, point.y * box.height);
      drawing.stroke();
    }
    if (strokes.current.length)
      onChangeRef.current(canvas.toDataURL("image/png"));
  }, [context]);

  useEffect(() => {
    fit();
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fit]);

  // O jsdom e navegadores antigos não informam pointerId.
  const pointerOf = (event: PointerEvent<HTMLCanvasElement>) =>
    event.pointerId ?? 1;
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      css: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      relative: {
        x: (event.clientX - rect.left) / (rect.width || 1),
        y: (event.clientY - rect.top) / (rect.height || 1),
      },
    };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    // Um dedo por vez: o segundo toque não começa outro traço.
    if (disabled || activePointer.current !== null) return;
    event.preventDefault();
    fit();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointer.current = pointerOf(event);
    const { css, relative } = point(event);
    strokes.current.push([relative]);
    const drawing = event.currentTarget.getContext("2d");
    drawing?.beginPath();
    drawing?.moveTo(css.x, css.y);
    drawing?.lineTo(css.x + 0.1, css.y + 0.1);
    drawing?.stroke();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== pointerOf(event)) return;
    event.preventDefault();
    const { css, relative } = point(event);
    strokes.current.at(-1)?.push(relative);
    const drawing = event.currentTarget.getContext("2d");
    drawing?.lineTo(css.x, css.y);
    drawing?.stroke();
  }
  /** Fim do traço, também quando o sistema cancela o toque (gesto do iOS, chamada…). */
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== pointerOf(event)) return;
    activePointer.current = null;
    onChange(event.currentTarget.toDataURL("image/png"));
  }
  function clear() {
    strokes.current = [];
    const current = context();
    current?.drawing.clearRect(
      0,
      0,
      current.canvas.width,
      current.canvas.height,
    );
    onChange("");
  }
  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Área de assinatura"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <button
        type="button"
        className="secondary-button button-sm"
        disabled={disabled}
        onClick={clear}
      >
        Limpar assinatura
      </button>
    </div>
  );
}
