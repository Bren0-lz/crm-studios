import type {
  CostCenter,
  FinancialCategory,
  FinancialWorkspace,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { FinanceRegistryModal } from "./FinanceRegistryModal";

/**
 * Categorias de despesa e centros de custo do formulário, com o cadastro rápido
 * ("+ Nova categoria" / "+ Novo centro de custo") num modal por cima da despesa.
 * `keep` mantém na lista a categoria e o centro atuais mesmo se inativados (edição).
 */
export function useExpenseClassifications({
  workspace,
  keep,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  keep?: { categoryId?: string; costCenterId?: string | undefined } | undefined;
  onCreated: (kind: "category" | "costCenter", id: string) => void;
}) {
  const toast = useToast();
  const [categories, setCategories] = useState<FinancialCategory[]>(() =>
    workspace.categories.filter(
      (category) =>
        category.kind === "expense" &&
        (category.active !== false || category.id === keep?.categoryId),
    ),
  );
  const [costCenters, setCostCenters] = useState<CostCenter[]>(() =>
    workspace.costCenters.filter(
      (center) => center.active !== false || center.id === keep?.costCenterId,
    ),
  );
  const [creating, setCreating] = useState<"category" | "costCenter" | null>(
    null,
  );
  const registry = creating && (
    <FinanceRegistryModal
      kind={creating}
      onClose={() => setCreating(null)}
      onConfirm={async (name) => {
        if (creating === "category") {
          const created = await api.createFinancialCategory({
            name,
            kind: "expense",
          });
          setCategories((items) => [...items, created]);
          onCreated("category", created.id);
          toast.success(`Categoria “${created.name}” criada.`);
        } else {
          const created = await api.createCostCenter({ name });
          setCostCenters((items) => [...items, created]);
          onCreated("costCenter", created.id);
          toast.success(`Centro de custo “${created.name}” criado.`);
        }
        setCreating(null);
      }}
    />
  );
  return { categories, costCenters, creating, setCreating, registry };
}
