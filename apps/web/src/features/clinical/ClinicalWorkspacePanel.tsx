import type { ClinicalAppointmentOption } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ClinicalChart } from "./ClinicalChart";
import { clinicalAppointmentRange, evolvableAppointments } from "./model";

/** Aba "Prontuário" da ficha do cliente: o mesmo prontuário da página Prontuários. */
export function ClinicalWorkspacePanel({
  patientId,
  editable,
}: {
  patientId: string;
  /** Sem edição de Prontuários: só consulta, impressão e exportação. */
  editable: boolean;
}) {
  const { can } = useAuthorization();
  const [appointments, setAppointments] = useState<ClinicalAppointmentOption[]>(
    [],
  );
  const canEvolve = editable && can("clinical.records_create");

  useEffect(() => {
    if (!canEvolve) return;
    let active = true;
    api
      .clinicalAppointmentOptions(...clinicalAppointmentRange())
      .then((options) => {
        if (active && Array.isArray(options))
          setAppointments(
            evolvableAppointments(options).filter(
              (appointment) => appointment.patientId === patientId,
            ),
          );
      })
      // Sem a lista, o prontuário segue funcionando; só não oferece "Evoluir sessão".
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canEvolve, patientId]);

  return (
    <section className="panel clinical-chart-shell">
      <ClinicalChart
        patientId={patientId}
        editable={editable}
        appointments={appointments}
      />
    </section>
  );
}
