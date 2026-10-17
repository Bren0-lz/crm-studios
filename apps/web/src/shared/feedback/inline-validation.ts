type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement;

/** Mensagem em português para a regra que o campo não cumpre. */
export function validationMessage(field: Field) {
  const { validity } = field;
  if (validity.valueMissing)
    return field instanceof HTMLSelectElement
      ? "Selecione uma opção."
      : field instanceof HTMLInputElement && field.type === "checkbox"
        ? "Marque esta opção para continuar."
        : "Preencha este campo.";
  if (validity.typeMismatch)
    return field.type === "email"
      ? "Informe um e-mail válido."
      : "Formato inválido.";
  if (validity.tooShort && "minLength" in field)
    return `Use pelo menos ${field.minLength} caracteres.`;
  if (validity.tooLong && "maxLength" in field)
    return `Use no máximo ${field.maxLength} caracteres.`;
  if (validity.rangeUnderflow && field instanceof HTMLInputElement)
    return `Use um valor a partir de ${field.min}.`;
  if (validity.rangeOverflow && field instanceof HTMLInputElement)
    return `Use um valor até ${field.max}.`;
  if (validity.stepMismatch) return "Valor fora dos intervalos aceitos.";
  if (validity.patternMismatch) return field.title || "Formato inválido.";
  if (validity.badInput) return "Valor inválido.";
  return field.validationMessage || "Valor inválido.";
}

/**
 * Troca os balões nativos do navegador ("Preencha este campo") por mensagens abaixo do
 * campo, em todo o sistema. Foca o primeiro campo inválido; a mensagem some ao corrigir.
 */
export function installInlineValidation(root: Document) {
  let focusedInRound = false;
  function errorFor(field: Field) {
    const container = field.closest("label") ?? field.parentElement;
    if (!container) return null;
    let error = container.querySelector<HTMLElement>(
      ":scope > .inline-field-error",
    );
    if (!error) {
      // O texto vem do CSS (data-message): fica fora do nome do campo, que é o rótulo.
      error = root.createElement("span");
      error.className = "inline-field-error";
      error.setAttribute("aria-hidden", "true");
      container.appendChild(error);
    }
    return error;
  }
  function clear(field: Field) {
    if (field.getAttribute("aria-invalid") !== "true") return;
    field.removeAttribute("aria-invalid");
    const container = field.closest("label") ?? field.parentElement;
    container?.querySelector(":scope > .inline-field-error")?.remove();
    field.removeAttribute("aria-description");
  }
  function onInvalid(event: Event) {
    if (!isField(event.target)) return;
    event.preventDefault();
    const field = event.target;
    const error = errorFor(field);
    field.setAttribute("aria-invalid", "true");
    const message = validationMessage(field);
    // Leitores de tela leem a mensagem como descrição do campo.
    field.setAttribute("aria-description", message);
    error?.setAttribute("data-message", message);
    if (!focusedInRound) {
      focusedInRound = true;
      field.focus();
      // Os eventos `invalid` de um envio chegam juntos; o próximo envio foca de novo.
      window.setTimeout(() => (focusedInRound = false), 0);
    }
  }
  function onEdit(event: Event) {
    if (isField(event.target) && event.target.checkValidity())
      clear(event.target);
  }
  root.addEventListener("invalid", onInvalid, true);
  root.addEventListener("input", onEdit, true);
  root.addEventListener("change", onEdit, true);
  return () => {
    root.removeEventListener("invalid", onInvalid, true);
    root.removeEventListener("input", onEdit, true);
    root.removeEventListener("change", onEdit, true);
  };
}
