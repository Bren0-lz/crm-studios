import { maxProductSizes, sortProductSizes } from "@crm/contracts";
import { ChevronLeft, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { maxSizeLength, parseSizes, sizeKey } from "../lib/product-sizes";

/**
 * Pergunta se os itens da categoria se distinguem por tamanho e, se sim, monta a lista de tamanhos
 * do jeito que esses itens são medidos (letras, números, volumes…), na ordem de exibição.
 */
export function ProductSizesEditor({
  enabled,
  sizes,
  draft,
  onEnabledChange,
  onSizesChange,
  onDraftChange,
}: {
  enabled: boolean;
  sizes: string[];
  draft: string;
  onEnabledChange: (enabled: boolean) => void;
  onSizesChange: (sizes: string[]) => void;
  onDraftChange: (draft: string) => void;
}) {
  const hintId = useId();
  const [message, setMessage] = useState("");
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
      setMessage(`A categoria pode ter até ${maxProductSizes} tamanhos.`);
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
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adiciona o tamanho em vez de enviar o formulário da categoria.
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  }
  function moveUp(index: number) {
    const next = [...sizes];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    onSizesChange(next);
  }
  return (
    <>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        Os itens desta categoria têm tamanhos
      </label>
      {enabled && (
        <fieldset className="form-fieldset size-editor">
          <legend>Tamanhos da categoria</legend>
          <p className="field-hint" id={hintId}>
            Escreva cada tamanho do jeito que esses itens são medidos e clique
            em Adicionar. Exemplos: P, M, G · 36, 38, 40 · 250 ml, 500 ml ·
            Infantil, Adulto. Para incluir vários de uma vez, separe por
            vírgula.
          </p>
          <div className="size-editor-add">
            <label>
              Novo tamanho
              <input
                value={draft}
                maxLength={200}
                placeholder="Ex.: 38"
                aria-describedby={hintId}
                onChange={(event) => {
                  onDraftChange(event.target.value);
                  setMessage("");
                }}
                onKeyDown={keyDown}
              />
            </label>
            <button type="button" className="secondary-button" onClick={add}>
              Adicionar
            </button>
          </div>
          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
          {sizes.length ? (
            <ol className="size-editor-list" aria-label="Tamanhos adicionados">
              {sizes.map((size, index) => (
                <li key={size} className="size-editor-item">
                  <span>{size}</span>
                  {index > 0 && (
                    <button
                      type="button"
                      className="icon-button button-sm"
                      aria-label={`Mover ${size} para antes`}
                      onClick={() => moveUp(index)}
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button button-sm"
                    aria-label={`Remover ${size}`}
                    onClick={() =>
                      onSizesChange(sizes.filter((item) => item !== size))
                    }
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="field-hint">Nenhum tamanho adicionado ainda.</p>
          )}
          <p className="field-hint">
            Os tamanhos aparecem nesta ordem no cadastro do produto, no estoque
            e na venda.
          </p>
        </fieldset>
      )}
    </>
  );
}
