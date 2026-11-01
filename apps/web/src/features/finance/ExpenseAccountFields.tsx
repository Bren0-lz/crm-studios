import type { CostCenter, FinancialCategory } from "@crm/contracts";
import { useId, type ReactNode } from "react";
import { useAuthorization } from "../../authorization-context";
import { HelpTip } from "../../shared/components/HelpTip";
import { CREATE_OPTION_VALUE } from "./expense-kind";
import { financeTermHelp } from "./model";

export type ExpenseAccountValue = {
  description: string;
  supplier: string;
  categoryId: string;
  costCenterId: string;
};

/**
 * Bloco "Conta" da despesa (pontual e fixa): descrição, fornecedor, categoria e centro de
 * custo, na mesma ordem nos dois tipos. O fornecedor é um campo só, com os cadastrados
 * como sugestão; `supplierField` troca esse campo (a pontual escolhe entre os cadastrados e
 * cadastra um novo no mesmo fluxo).
 */
export function ExpenseAccountFields({
  value,
  onChange,
  categories,
  costCenters,
  onCreate,
  supplierNames = [],
  supplierField,
}: {
  value: ExpenseAccountValue;
  onChange: (patch: Partial<ExpenseAccountValue>) => void;
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  onCreate: (kind: "category" | "costCenter") => void;
  supplierNames?: string[];
  supplierField?: ReactNode;
}) {
  const { can } = useAuthorization();
  const suggestionsId = useId();
  const canCreateCategory = can("finance.categories_create");
  const canCreateCostCenter = can("finance.cost_centers_create");
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Conta</legend>
      <div className="form-fieldset-grid">
        <label className="span-2">
          Descrição
          <input
            required
            minLength={3}
            value={value.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>
        {supplierField ?? (
          <label>
            Fornecedor
            <input
              list={supplierNames.length > 0 ? suggestionsId : undefined}
              value={value.supplier}
              onChange={(event) => onChange({ supplier: event.target.value })}
            />
            {supplierNames.length > 0 && (
              <datalist id={suggestionsId}>
                {supplierNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </label>
        )}
        <div className="field-with-hint">
          <label>
            Categoria
            <select
              required
              value={value.categoryId}
              className="select-opens-down"
              onChange={(event) => {
                if (event.target.value === CREATE_OPTION_VALUE)
                  onCreate("category");
                else onChange({ categoryId: event.target.value });
              }}
            >
              {categories.length === 0 && (
                <option value="">Nenhuma categoria cadastrada</option>
              )}
              {categories.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
              {canCreateCategory && (
                <option value={CREATE_OPTION_VALUE}>+ Nova categoria</option>
              )}
            </select>
          </label>
          {categories.length === 0 && !canCreateCategory && (
            <span className="field-hint">
              Peça a quem administra o financeiro para cadastrar.
            </span>
          )}
        </div>
        <label>
          <span className="label-with-help">
            Centro de custo (opcional)
            <HelpTip term="Centro de custo" text={financeTermHelp.costCenter} />
          </span>
          <select
            value={value.costCenterId}
            className="select-opens-down"
            onChange={(event) => {
              if (event.target.value === CREATE_OPTION_VALUE)
                onCreate("costCenter");
              else onChange({ costCenterId: event.target.value });
            }}
          >
            <option value="">Sem centro de custo</option>
            {costCenters.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
            {canCreateCostCenter && (
              <option value={CREATE_OPTION_VALUE}>
                + Novo centro de custo
              </option>
            )}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
