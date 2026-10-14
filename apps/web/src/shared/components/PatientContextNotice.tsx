import type { PatientOption } from "@crm/contracts";
import { Link, useLocation } from "react-router-dom";
export function PatientContextNotice({
  patientId,
  patients,
}: {
  patientId: string;
  patients: PatientOption[];
}) {
  const { pathname } = useLocation();
  if (!patientId) return null;
  const patient = patients.find((item) => item.id === patientId);
  return (
    <div className="panel patient-context-notice">
      <strong>{patient?.fullName ?? "Contexto do cliente"}</strong>
      <div className="page-actions">
        <Link className="secondary-button" to={`/clientes/${patientId}`}>
          Voltar ao cliente
        </Link>
        <Link className="secondary-button" to={pathname}>
          Ver todos os clientes
        </Link>
      </div>
    </div>
  );
}
