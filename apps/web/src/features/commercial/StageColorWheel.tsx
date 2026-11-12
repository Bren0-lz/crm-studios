import { leadStageColor, leadStagePalette } from "@crm/contracts";
import {
  type CSSProperties,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { tagColorStyle } from "../../tag-colors";

interface HsvColor {
  /** Matiz em graus [0, 360). */
  h: number;
  /** Saturação [0, 1]. */
  s: number;
  /** Brilho/valor [0, 1]. */
  v: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Converte `#rrggbb` em HSV (`h` 0–360, `s` e `v` 0–1). */
function hexToHsv(color: string): HsvColor {
  const hex = leadStageColor({ color });
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

/** Converte HSV (`h` 0–360, `s` e `v` 0–1) em `#rrggbb` minúsculo. */
function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const [rPrime, gPrime, bPrime]: [number, number, number] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`;
}

/** Calcula matiz e saturação a partir da posição clicada/arrastada na roda cromática. */
function wheelPointToHsv(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  currentV: number,
): HsvColor {
  const rx = Math.max(1, rect.width / 2);
  const ry = Math.max(1, rect.height / 2);
  const nx = (clientX - (rect.left + rx)) / rx;
  const ny = (clientY - (rect.top + ry)) / ry;
  const h = ((Math.atan2(ny, nx) * 180) / Math.PI + 360) % 360;
  const s = clamp(Math.hypot(nx, ny), 0, 1);
  const v = currentV < 0.2 ? 0.85 : clamp(currentV, 0.15, 1);
  return { h, s, v };
}

/** Variáveis CSS da roda cromática (posição do cursor, brilho e cor ativa). */
function stageWheelStyle(hsv: HsvColor, color: string): CSSProperties {
  const angle = (hsv.h * Math.PI) / 180;
  const x = 50 + hsv.s * 50 * Math.cos(angle);
  const y = 50 + hsv.s * 50 * Math.sin(angle);
  return {
    "--stage-color": leadStageColor({ color }),
    "--wheel-x": `${x.toFixed(1)}%`,
    "--wheel-y": `${y.toFixed(1)}%`,
    "--wheel-shade": (1 - clamp(hsv.v, 0, 1)).toFixed(3),
    "--wheel-pure": hsvToHex(hsv.h, hsv.s, 1),
  } as CSSProperties;
}

/**
 * Seletor de cor da bolinha da etapa do funil comercial: roda cromática interativa (matiz e
 * saturação em detalhe), controle de brilho, paleta rápida, seletor nativo e prévia da coluna.
 */
export function StageColorWheel({
  value,
  previewLabel,
  onChange,
}: {
  value: string;
  previewLabel: string;
  onChange: (color: string) => void;
}) {
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value));
  const [prevValue, setPrevValue] = useState(value);
  const wheelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  if (value !== prevValue) {
    setPrevValue(value);
    if (hsvToHex(hsv.h, hsv.s, hsv.v) !== value.toLowerCase()) {
      setHsv(hexToHsv(value));
    }
  }

  function applyHsv(next: HsvColor) {
    const hex = hsvToHex(next.h, next.s, next.v);
    setHsv(next);
    setPrevValue(hex);
    onChange(hex);
  }

  function selectHex(raw: string) {
    const hex = leadStageColor({ color: raw });
    setHsv(hexToHsv(hex));
    setPrevValue(hex);
    onChange(hex);
  }

  function pickFromWheel(clientX: number, clientY: number) {
    const element = wheelRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    applyHsv(wheelPointToHsv(clientX, clientY, rect, hsv.v));
  }

  function handleWheelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      applyHsv({ ...hsv, h: (hsv.h + 10) % 360 });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyHsv({ ...hsv, h: (hsv.h + 350) % 360 });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      applyHsv({ ...hsv, s: clamp(hsv.s + 0.08, 0, 1) });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyHsv({ ...hsv, s: clamp(hsv.s - 0.08, 0, 1) });
    }
  }

  return (
    <fieldset
      className="form-fieldset span-2 lead-stage-color-picker"
      style={stageWheelStyle(hsv, value)}
    >
      <legend>Cor da bolinha</legend>
      <div className="lead-stage-color-layout">
        <div
          ref={wheelRef}
          role="slider"
          tabIndex={0}
          aria-label="Roda cromática"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={value.toUpperCase()}
          className="lead-stage-wheel"
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            pickFromWheel(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return;
            pickFromWheel(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          onClick={(event) => pickFromWheel(event.clientX, event.clientY)}
          onKeyDown={handleWheelKeyDown}
        >
          <span className="lead-stage-wheel-shade" aria-hidden="true" />
          <span className="lead-stage-wheel-thumb" aria-hidden="true" />
        </div>
        <div className="lead-stage-color-controls">
          <div className="lead-stage-color-preview" aria-label="Prévia da etapa">
            <i className="kanban-stage-dot" aria-hidden="true" />
            <strong>{previewLabel}</strong>
            <code>{value.toUpperCase()}</code>
          </div>
          <label className="lead-stage-brightness">
            Brilho da cor
            <input
              type="range"
              min={15}
              max={100}
              value={Math.round(hsv.v * 100)}
              onChange={(event) =>
                applyHsv({ ...hsv, v: Number(event.target.value) / 100 })
              }
            />
          </label>
          <div
            className="tag-palette"
            role="group"
            aria-label="Cores sugeridas"
          >
            {leadStagePalette.map((item) => (
              <button
                type="button"
                key={item.color}
                className="tag-swatch"
                style={tagColorStyle(item.color)}
                aria-label={`Cor ${item.name}`}
                aria-pressed={value.toLowerCase() === item.color}
                title={item.name}
                onClick={() => selectHex(item.color)}
              />
            ))}
          </div>
          <div className="tag-color-row">
            <label className="tag-custom-color">
              Cor da etapa
              <input
                type="color"
                value={value}
                onChange={(event) => selectHex(event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
