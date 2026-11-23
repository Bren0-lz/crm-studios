import type { ClinicCatalogKind } from "@crm/contracts";
import { CatalogSection } from "./CatalogSection";

const catalogKinds: ClinicCatalogKind[] = [
  "lead_source",
  "lead_channel",
  "lead_lost_reason",
];

/**
 * Cadastros comerciais compartilhados da clínica.
 * Categorias e marcas de produtos ficam em Vendas de produtos › Categorias e marcas;
 * fornecedores, em Vendas de produtos › Fornecedores.
 */
export function ClinicCatalogsContent() {
  return (
    <div className="settings-panel-body catalog-settings">
      <div className="catalog-groups">
        {catalogKinds.map((kind) => (
          <CatalogSection key={kind} kind={kind} />
        ))}
      </div>
    </div>
  );
}
