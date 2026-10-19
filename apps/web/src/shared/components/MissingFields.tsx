import { useId } from "react";

/**
 * O que ainda falta para enviar um formulário (QM14): enquanto houver item, o botão
 * principal fica desativado (`blocked`) e a lista "Falta: …" aparece visível, ligada
 * ao botão por `aria-describedby` (`describedBy`). Some quando tudo está preenchido.
 */
export function useMissingFields(
  missing: string[],
  className = "field-hint span-2",
) {
  const id = useId();
  const blocked = missing.length > 0;
  return {
    blocked,
    describedBy: blocked ? id : undefined,
    hint: blocked ? (
      <p className={className} id={id}>
        Falta: {missing.join(", ")}.
      </p>
    ) : null,
  };
}

/** Rótulos dos campos vazios (texto só com espaços conta como vazio). */
export function missingLabels(fields: Array<[label: string, value: unknown]>) {
  return fields
    .filter(([, value]) =>
      typeof value === "string" ? !value.trim() : value == null,
    )
    .map(([label]) => label);
}

/** Data e horário completos no formato do seletor de agenda ("aaaa-mm-ddThh:mm"). */
export function isCompleteDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}

/** Campos de um modelo clínico em montagem: pergunta vazia e seleção sem opções. */
export function missingBuilderFields(
  fields: Array<{ label: string; type: string; options?: string[] }>,
) {
  return fields.flatMap((field, index) => [
    ...(field.label.trim() ? [] : [`Pergunta do campo ${index + 1}`]),
    ...(["select", "multiselect"].includes(field.type) &&
    !(field.options ?? []).some((option) => option.trim())
      ? [`Opções do campo ${index + 1}`]
      : []),
  ]);
}
