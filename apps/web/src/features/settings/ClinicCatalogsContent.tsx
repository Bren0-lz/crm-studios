import { ClinicalResourcesPanel } from "../clinical/index";
import { SuppliersSection } from "../finance/index";
import type { ClinicCatalogKind } from "@crm/contracts";
import { Activity, Megaphone, Truck } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { CatalogSection } from "./CatalogSection";
import { ReportTabs, type ReportTab } from "../reports/index";

type Group = "commercial" | "suppliers" | "clinical";
const groups: ReportTab<Group>[] = [
  { key: "commercial", label: "Comercial", icon: Megaphone },
  { key: "suppliers", label: "Fornecedores", icon: Truck },
  { key: "clinical", label: "Clínico", icon: Activity },
];
const groupKinds: Record<Group, ClinicCatalogKind[]> = {
  commercial: ["lead_source", "lead_channel", "lead_lost_reason"],
  suppliers: [],
  clinical: ["muscle_group"],
};

/**
 * Cadastros compartilhados em sub-abas; cada lista carrega na primeira visita.
 * Categorias e marcas de produtos ficam em Vendas de produtos › Categorias e marcas.
 */
export function ClinicCatalogsContent() {
  const { can } = useAuthorization();
  const tabs = groups.filter(
    (group) => group.key !== "suppliers" || can("finance.view"),
  );
  return (
    <div className="settings-panel-body catalog-settings">
      <ReportTabs sub label="Grupos de cadastros" tabs={tabs}>
        {(group) =>
          group === "suppliers" ? (
            <SuppliersSection embedded />
          ) : (
            <div className="catalog-groups">
              {groupKinds[group].map((kind) => (
                <CatalogSection key={kind} kind={kind} />
              ))}
              {group === "clinical" && can("clinical.view") && (
                <section className="catalog-section">
                  <header className="catalog-section-head">
                    <div>
                      <h3>Aparelhos e exercícios</h3>
                      <p>Recursos compartilhados nos prontuários.</p>
                    </div>
                  </header>
                  <ClinicalResourcesPanel
                    patientId=""
                    patients={[]}
                    catalogOnly
                  />
                </section>
              )}
            </div>
          )
        }
      </ReportTabs>
    </div>
  );
}
