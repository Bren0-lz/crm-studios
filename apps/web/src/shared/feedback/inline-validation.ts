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

/** Remove a mensagem abaixo do campo e os atributos de erro (ex.: ao escolher um cliente). */
export function clearInlineValidation(field: Field) {
  if (field.getAttribute("aria-invalid") !== "true") return;
  field.removeAttribute("aria-invalid");
  field.removeAttribute("data-form-error");
  const container = field.closest("label") ?? field.parentElement;
  container?.querySelector(":scope > .inline-field-error")?.remove();
  field.removeAttribute("aria-description");
}

/** Artigos ignorados ao comparar mensagem e rótulo ("Informe a data e o horário" ~ "Data e horário"). */
const IGNORED_WORDS = new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas"]);

function normalizeWords(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !IGNORED_WORDS.has(word))
    .join(" ");
}

/** Texto do rótulo de um campo, sem o texto das opções, de botões e de mensagens de erro. */
function labelText(field: Field) {
  const texts: string[] = [];
  for (const label of Array.from(field.labels ?? [])) {
    const walker = label.ownerDocument.createTreeWalker(
      label,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (
        !node.parentElement?.closest(
          "select, textarea, button, .inline-field-error, [aria-hidden='true']",
        )
      )
        texts.push(node.textContent ?? "");
  }
  return texts.join(" ") || field.getAttribute("aria-label") || "";
}

/**
 * Campo do formulário que a mensagem de erro cita pelo rótulo ("Já existe um cliente com
 * este CPF." → campo "CPF"). Vence o rótulo mais longo citado; mensagens genéricas
 * ("Não foi possível…") não apontam campo.
 */
export function fieldForMessage(scope: ParentNode, message: string) {
  const text = ` ${normalizeWords(message)} `;
  if (text.startsWith(" nao foi possivel ")) return null;
  let best: { field: Field; length: number } | null = null;
  for (const field of Array.from(
    scope.querySelectorAll<Field>("input, select, textarea"),
  )) {
    if (field.disabled || ["hidden", "submit", "button"].includes(field.type))
      continue;
    const label = normalizeWords(labelText(field));
    if (label.length < 3 || !text.includes(` ${label} `)) continue;
    if (!best || label.length > best.length)
      best = { field, length: label.length };
  }
  return best?.field ?? null;
}

/**
 * Troca os balões nativos do navegador ("Preencha este campo") por balões abaixo do
 * campo, em todo o sistema. Foca o primeiro campo inválido; a mensagem some ao corrigir.
 * Erros mostrados depois do envio (`.form-error`, ex.: "Já existe um cliente com este
 * CPF.") também vão para o campo que citam, que recebe o foco.
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
  function showError(field: Field, message: string) {
    field.setAttribute("aria-invalid", "true");
    // Leitores de tela leem a mensagem como descrição do campo.
    field.setAttribute("aria-description", message);
    errorFor(field)?.setAttribute("data-message", message);
  }
  function onInvalid(event: Event) {
    if (!isField(event.target)) return;
    event.preventDefault();
    const field = event.target;
    field.removeAttribute("data-form-error");
    showError(field, validationMessage(field));
    if (!focusedInRound) {
      focusedInRound = true;
      field.focus();
      // Os eventos `invalid` de um envio chegam juntos; o próximo envio foca de novo.
      window.setTimeout(() => (focusedInRound = false), 0);
    }
  }
  function onEdit(event: Event) {
    // Sem `checkValidity()` (que dispara `invalid`): editar nunca cria erro em campo sem
    // erro; num campo já marcado, a mensagem acompanha a regra ainda não cumprida.
    if (!isField(event.target)) return;
    const field = event.target;
    if (field.validity.valid) {
      clearInlineValidation(field);
      return;
    }
    if (field.getAttribute("aria-invalid") !== "true") return;
    const message = validationMessage(field);
    field.setAttribute("aria-description", message);
    (field.closest("label") ?? field.parentElement)
      ?.querySelector(":scope > .inline-field-error")
      ?.setAttribute("data-message", message);
  }

  // Erro de envio → campo citado. O aviso do rodapé fica só para leitores de tela.
  const fieldOfError = new WeakMap<Element, Field>();
  function forget(error: Element) {
    const field = fieldOfError.get(error);
    fieldOfError.delete(error);
    error.classList.remove("is-at-field");
    if (field?.hasAttribute("data-form-error")) clearInlineValidation(field);
  }
  function onFormError(error: HTMLElement) {
    const message = error.textContent?.trim() ?? "";
    if (error.getAttribute("data-shown-message") === message) return;
    error.setAttribute("data-shown-message", message);
    forget(error);
    if (!message) return;
    const scope =
      error.closest("form") ??
      error.closest("[role='dialog']") ??
      error.parentElement;
    const field = scope && fieldForMessage(scope, message);
    if (!field) {
      error.scrollIntoView?.({ block: "nearest" });
      return;
    }
    showError(field, message);
    field.setAttribute("data-form-error", "true");
    fieldOfError.set(error, field);
    error.classList.add("is-at-field");
    field.focus({ preventScroll: true });
    field.scrollIntoView?.({ block: "center" });
  }
  const formErrorsIn = (node: Node) =>
    node instanceof Element
      ? [
          ...(node.matches(".form-error") ? [node] : []),
          ...Array.from(node.querySelectorAll(".form-error")),
        ]
      : [];
  const observer = new MutationObserver((records) => {
    const changed = new Set<HTMLElement>();
    for (const record of records) {
      record.removedNodes.forEach((node) => formErrorsIn(node).forEach(forget));
      record.addedNodes.forEach((node) =>
        formErrorsIn(node).forEach((error) =>
          changed.add(error as HTMLElement),
        ),
      );
      const target =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      const error = target?.closest<HTMLElement>(".form-error");
      if (error) changed.add(error);
    }
    changed.forEach((error) => error.isConnected && onFormError(error));
  });
  observer.observe(root.body ?? root.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  root.addEventListener("invalid", onInvalid, true);
  root.addEventListener("input", onEdit, true);
  root.addEventListener("change", onEdit, true);
  return () => {
    observer.disconnect();
    root.removeEventListener("invalid", onInvalid, true);
    root.removeEventListener("input", onEdit, true);
    root.removeEventListener("change", onEdit, true);
  };
}
