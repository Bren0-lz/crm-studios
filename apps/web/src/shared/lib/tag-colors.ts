import { DEFAULT_PATIENT_TAG_COLOR } from "@crm/contracts";
import type { CSSProperties } from "react";

/** Paleta sugerida para as etiquetas (Configurações › Etiquetas); qualquer cor #RRGGBB vale. */
export const patientTagPalette: ReadonlyArray<{ name: string; color: string }> =
  [
    { name: "Cinza", color: DEFAULT_PATIENT_TAG_COLOR },
    { name: "Verde", color: "#276749" },
    { name: "Turquesa", color: "#0d9488" },
    { name: "Azul", color: "#2563eb" },
    { name: "Roxo", color: "#7c3aed" },
    { name: "Rosa", color: "#db2777" },
    { name: "Vermelho", color: "#dc2626" },
    { name: "Laranja", color: "#ea580c" },
    { name: "Amarelo", color: "#facc15" },
  ];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Cor válida (#rrggbb, minúsculas); qualquer outra coisa vira a cor padrão. */
export function normalizeTagColor(color: string | undefined | null): string {
  return typeof color === "string" && HEX_COLOR.test(color)
    ? color.toLowerCase()
    : DEFAULT_PATIENT_TAG_COLOR;
}

/** Luminância relativa (WCAG 2.x) de uma cor #rrggbb. */
export function relativeLuminance(color: string): number {
  const hex = normalizeTagColor(color);
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste (WCAG) entre duas cores #rrggbb, de 1 a 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Cor do texto sobre o fundo da etiqueta: preto ou branco, o que tiver mais contraste. Entre os
 * dois, o melhor sempre passa de 4,5:1 (AA) para qualquer fundo.
 */
export function tagTextColor(background: string): "#000000" | "#ffffff" {
  return contrastRatio(background, "#000000") >=
    contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

/**
 * Cor da etiqueta como variáveis CSS (`--tag-color` e `--tag-text`), usadas pelas classes
 * `tag-colored`, `tag-choice` e `tag-dot`. A cor vem do cadastro, por isso não cabe em classe fixa.
 */
export function tagColorStyle(color: string | undefined | null): CSSProperties {
  const background = normalizeTagColor(color);
  return {
    "--tag-color": background,
    "--tag-text": tagTextColor(background),
  } as CSSProperties;
}
