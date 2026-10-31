import { maxProductSizes, sortProductSizes } from "@crm/contracts";
import { GripVertical, Plus, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { maxSizeLength, parseSizes, sizeKey } from "../lib/product-sizes";

const scopeText = {
  category: {
    toggle: "Os itens desta categoria têm tamanhos",
    legend: "Tamanhos da categoria",
    owner: "A categoria",
    order:
      "Os tamanhos aparecem nesta ordem no cadastro do produto, no estoque e na venda.",
  },
  product: {
    toggle: "Este produto tem distinção de tamanho",
    legend: "Tamanhos do produto",
    owner: "O produto",
    order:
      "Os tamanhos aparecem nesta ordem no estoque, nos pedidos e na venda.",
  },
};

/**
 * Pergunta se os itens da categoria (ou o produto) se distinguem por tamanho e, se sim, monta a
 * lista de tamanhos do jeito que esses itens são medidos (letras, números, volumes…), na ordem de
 * exibição.
 */
export function ProductSizesEditor({
  scope = "category",
  enabled,
  sizes,
  draft,
  onEnabledChange,
  onSizesChange,
  onDraftChange,
}: {
  scope?: "category" | "product";
  enabled: boolean;
  sizes: string[];
  draft: string;
  onEnabledChange: (enabled: boolean) => void;
  onSizesChange: (sizes: string[]) => void;
  onDraftChange: (draft: string) => void;
}) {
  const text = scopeText[scope];
  const hintId = useId();
  const [message, setMessage] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  function add() {
    const typed = parseSizes(draft);
    if (!typed.length) {
      setMessage("Digite um tamanho para adicionar.");
      return;
    }
    if (typed.some((size) => size.length > maxSizeLength)) {
      setMessage(`Cada tamanho pode ter até ${maxSizeLength} caracteres.`);
      return;
    }
    const next = sortProductSizes([...sizes, ...typed]);
    if (next.length > maxProductSizes) {
      setMessage(`${text.owner} pode ter até ${maxProductSizes} tamanhos.`);
      return;
    }
    const added = new Set(sizes.map(sizeKey));
    const repeated = typed.filter((size) => {
      const key = sizeKey(size);
      if (!added.has(key)) {
        added.add(key);
        return false;
      }
      return true;
    });
    setMessage(
      repeated.length
        ? `${repeated.map((size) => `“${size}”`).join(", ")} já ${repeated.length === 1 ? "está" : "estão"} na lista.`
        : "",
    );
    onSizesChange(next);
    onDraftChange("");
  }
  function draftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adiciona o tamanho em vez de enviar o formulário.
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= sizes.length) return;
    const next = [...sizes];
    const [size] = next.splice(from, 1);
    next.splice(to, 0, size!);
    onSizesChange(next);
    setAnnouncement(`${size} agora é o ${to + 1}º de ${next.length}.`);
  }
  function remove(size: string) {
    onSizesChange(sizes.filter((item) => item !== size));
    setAnnouncement(`${size} removido.`);
  }
  // Arrastar com mouse ou toque: o item muda de lugar assim que o ponteiro passa da metade do
  // vizinho. Os ouvintes ficam na janela porque o React move o <li> no DOM a cada troca.
  useEffect(() => {
    if (!dragging) return;
    function pointerMove(event: PointerEvent) {
      const items = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-size]") ?? [],
      );
      const from = sizes.indexOf(dragging!);
      const to = items.findIndex((item, index) => {
        if (index === from) return false;
        const box = item.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          return false;
        const middle = box.left + box.width / 2;
        const sameRow =
          Math.abs(box.top - items[from]!.getBoundingClientRect().top) < 2;
        if (!sameRow) return true;
        return index > from ? event.clientX > middle : event.clientX < middle;
      });
      if (to >= 0) move(from, to);
    }
    function pointerUp() {
      setDragging(null);
    }
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
    };
  });
  function pointerDown(event: ReactPointerEvent<HTMLLIElement>, size: string) {
    if (event.button !== 0 || sizes.length < 2) return;
    if ((event.target as HTMLElement).closest("[data-remove]")) return;
    event.preventDefault();
    setDragging(size);
  }
  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const target = {
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      Home: 0,
      End: sizes.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    move(index, target);
  }
  return (
    <>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        {text.toggle}
      </label>
      {enabled && (
        <fieldset className="form-fieldset size-editor">
          <legend>{text.legend}</legend>
          <p className="field-hint" id={hintId}>
            Escreva do jeito que esses itens são medidos: P, M, G · 36, 38, 40 ·
            250 ml, 500 ml · Infantil, Adulto. Separe por vírgula para incluir
            vários de uma vez.
          </p>
          <div className="size-editor-add">
            <label>
              Novo tamanho
              <input
                value={draft}
                maxLength={200}
                placeholder="Ex.: P, M, G"
                aria-describedby={hintId}
                onChange={(event) => {
                  onDraftChange(event.target.value);
                  setMessage("");
                }}
                onKeyDown={draftKeyDown}
              />
            </label>
            <button type="button" className="secondary-button" onClick={add}>
              <Plus size={16} aria-hidden="true" />
              Adicionar
            </button>
          </div>
          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
          <div className="size-editor-box">
            <div className="size-editor-box-head">
              <span>Ordem de exibição</span>
              <span className="field-hint">
                {sizes.length} de {maxProductSizes}
              </span>
            </div>
            {sizes.length ? (
              <ol
                ref={listRef}
                className={
                  dragging ? "size-editor-list is-sorting" : "size-editor-list"
                }
                aria-label="Tamanhos adicionados"
              >
                {sizes.map((size, index) => (
                  <li
                    key={size}
                    data-size={size}
                    className={
                      size === dragging
                        ? "size-editor-item is-dragging"
                        : "size-editor-item"
                    }
                    onPointerDown={(event) => pointerDown(event, size)}
                  >
                    <button
                      type="button"
                      className="size-editor-handle"
                      aria-label={`Reordenar ${size}, posição ${index + 1} de ${sizes.length}`}
                      aria-describedby={`${hintId}-order`}
                      disabled={sizes.length < 2}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </button>
                    <span className="size-editor-label">{size}</span>
                    <button
                      type="button"
                      data-remove
                      className="size-editor-remove"
                      aria-label={`Remover ${size}`}
                      onClick={() => remove(size)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="size-editor-empty">
                Nenhum tamanho adicionado ainda.
              </p>
            )}
            <p className="field-hint" id={`${hintId}-order`}>
              {sizes.length > 1
                ? "Arraste os tamanhos para mudar a ordem (no teclado, use as setas sobre a alça). "
                : ""}
              {text.order}
            </p>
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </fieldset>
      )}
    </>
  );
}
