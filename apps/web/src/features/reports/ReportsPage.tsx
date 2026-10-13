import { useAuthorization } from "../../authorization-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReportsDetails } from "./ReportsDetails";
import { SalesInsights } from "./SalesInsights";

export function ReportsPage() {
  const { can } = useAuthorization();
  return (
    <>
      <PageHeader
        eyebrow="Gestão por evidências"
        title="Relatórios gerenciais"
        description="Veja o resultado do mês e encontre quem precisa de acompanhamento."
      />
      {can("reports.sales") && <SalesInsights />}
      {(can("reports.management") ||
        can("reports.retention") ||
        can("reports.clients")) && <ReportsDetails />}
      {!can("reports.sales") &&
        !can("reports.management") &&
        !can("reports.retention") &&
        !can("reports.clients") && (
          <p className="muted-copy">
            Nenhum relatório foi liberado para seu usuário.
          </p>
        )}
    </>
  );
}
