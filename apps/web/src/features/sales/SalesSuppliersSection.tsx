import { SuppliersSection } from "../finance/index";

/** Cadastro de fornecedores dentro de Vendas de produtos (permissão `patients.suppliers_manage`). */
export function SalesSuppliersSection() {
  return (
    <section className="panel" aria-label="Fornecedores">
      <div className="sales-suppliers">
        <SuppliersSection embedded sales />
      </div>
    </section>
  );
}
