import { ClinicalChart } from "./ClinicalChart";

/** Aba "Prontuário" da ficha do cliente: o mesmo prontuário da página Prontuários. */
export function ClinicalWorkspacePanel({
  patientId,
  editable,
}: {
  patientId: string;
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
}) {
  return (
    <section className="panel clinical-chart-shell">
      <ClinicalChart patientId={patientId} editable={editable} />
    </section>
  );
}
