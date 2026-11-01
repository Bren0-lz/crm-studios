import { productSizeLabel } from "@crm/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { currency } from "../../shared/lib/formatting";
import { ProductModal } from "../sales/index";
import type { SupplierOrderDraft } from "./supplier-order-draft";

/** Valor do seletor de produto que abre o cadastro de um produto novo por cima do pedido. */
const NEW_PRODUCT = "new";

/**
 * Campos do pedido: data, número, valor e itens. Produto novo é cadastrado num modal por cima;
 * produto com tamanhos recebe a quantidade de cada tamanho. Todos os itens entram no estoque.
 */
export function SupplierOrderFields({
  draft,
  disabled = false,
}: {
  draft: SupplierOrderDraft;
  disabled?: boolean;
}) {
  const hintId = useId();
  const { products, lines } = draft;
  const itemsCostInCents = lines.reduce(
    (sum, line) => sum + draft.lineQuantity(line) * (line.unitCostInCents ?? 0),
    0,
  );
  return (
    <>
      <fieldset className="form-fields form-grid" disabled={disabled}>
        <label>
          Data do pedido
          <input
            type="date"
            required
            value={draft.orderedOn}
            onChange={(event) => draft.setOrderedOn(event.target.value)}
          />
        </label>
        <label>
          Nº do pedido
          <input
            maxLength={60}
            placeholder="Opcional"
            value={draft.number}
            onChange={(event) => draft.setNumber(event.target.value)}
          />
        </label>
        <div className="field-with-hint">
          <label>
            Valor do pedido (R$)
            <MoneyInput
              required
              aria-describedby={hintId}
              valueInCents={draft.totalInCents}
              onChange={draft.setTotalInCents}
            />
          </label>
          <small className="field-hint" id={hintId}>
            {itemsCostInCents > 0
              ? `Soma dos itens: ${currency.format(itemsCostInCents / 100)}`
              : "Total pago ao fornecedor, com frete e descontos."}
          </small>
        </div>

        <fieldset className="form-fieldset span-2">
          <legend>Itens do pedido</legend>
          <div className="supplier-order-lines" role="group" aria-label="Itens">
            {lines.map((line, index) => {
              const position = index + 1;
              const sizes = draft.sizesOf(line);
              return (
                <div className="supplier-order-item" key={line.key}>
                  <div className="supplier-order-line">
                    <label>
                      Produto
                      <select
                        aria-label={`Produto ${position}`}
                        required
                        value={line.productId}
                        onChange={(event) =>
                          event.target.value === NEW_PRODUCT
                            ? draft.setCreatingFor(line.key)
                            : draft.updateLine(line.key, {
                                productId: event.target.value,
                                quantity: 1,
                                sizeQuantities: {},
                              })
                        }
                      >
                        <option value="">
                          {products ? "Selecione" : "Carregando…"}
                        </option>
                        <option value={NEW_PRODUCT}>
                          + Novo produto (cadastrar)
                        </option>
                        {products?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sizes.length === 0 && (
                      <label>
                        Quantidade
                        <input
                          aria-label={`Quantidade ${position}`}
                          type="number"
                          required
                          min={1}
                          value={line.quantity}
                          onChange={(event) =>
                            draft.updateLine(line.key, {
                              quantity: Math.max(
                                1,
                                Math.trunc(Number(event.target.value) || 1),
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                    <label>
                      Custo unitário (R$)
                      <MoneyInput
                        aria-label={`Custo unitário ${position}`}
                        placeholder="Opcional"
                        valueInCents={line.unitCostInCents}
                        onChange={(cents) =>
                          draft.updateLine(line.key, { unitCostInCents: cents })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Remover item ${position}`}
                      disabled={lines.length === 1}
                      onClick={() =>
                        draft.setLines((current) =>
                          current.filter((other) => other.key !== line.key),
                        )
                      }
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                  {sizes.length > 0 && (
                    <fieldset className="form-fieldset">
                      <legend>Quantidade por tamanho</legend>
                      <div className="product-size-grid">
                        {sizes.map((size) => (
                          <label key={size}>
                            {productSizeLabel(size)}
                            <input
                              aria-label={`Quantidade ${productSizeLabel(size)} do item ${position}`}
                              type="number"
                              min={0}
                              value={line.sizeQuantities[size] ?? 0}
                              onChange={(event) =>
                                draft.updateLine(line.key, {
                                  sizeQuantities: {
                                    ...line.sizeQuantities,
                                    [size]: Math.max(
                                      0,
                                      Math.trunc(
                                        Number(event.target.value) || 0,
                                      ),
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <p className="field-hint">
                        {`Total: ${draft.lineQuantity(line)} ${draft.productOf(line.productId)?.unit ?? "un"}. Deixe em 0 os tamanhos que não vieram.`}
                      </p>
                    </fieldset>
                  )}
                </div>
              );
            })}
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={lines.length >= 100}
                onClick={draft.addLine}
              >
                <Plus size={16} aria-hidden="true" /> Adicionar item
              </button>
            </div>
            <p className="field-hint">
              Produto que ainda não existe: escolha “Novo produto (cadastrar)”
              para cadastrá-lo sem sair do pedido, com os tamanhos que ele
              tiver. Sem preço de venda ele não pode ser vendido.
            </p>
          </div>
        </fieldset>

        <label className="span-2">
          Observações do pedido
          <textarea
            maxLength={1000}
            value={draft.notes}
            onChange={(event) => draft.setNotes(event.target.value)}
          />
        </label>
      </fieldset>
    </>
  );
}

/**
 * Cadastro do produto novo de um item, por cima do modal do pedido. Fica fora dele
 * (irmão do `Modal`), porque o modal de baixo fica inerte enquanto este está aberto.
 */
export function SupplierOrderProductModal({
  draft,
}: {
  draft: SupplierOrderDraft;
}) {
  if (draft.creatingFor === null) return null;
  return (
    <ProductModal
      product="new"
      fromSupplierOrder
      onClose={() => draft.setCreatingFor(null)}
      onSaved={draft.productCreated}
    />
  );
}
