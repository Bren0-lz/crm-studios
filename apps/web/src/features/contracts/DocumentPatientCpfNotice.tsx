import { documentPatientCpfRequiredMessage } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";

export function DocumentPatientCpfNotice({ patientId }: { patientId: string }) {
  const { canView } = useAuthorization();
  return (
    <div className="document-data-notice" role="alert">
      <strong>CPF do cliente obrigatório neste contrato</strong>
      <p>{documentPatientCpfRequiredMessage}</p>
      {canView("patients") && (
        <a href={`/clientes/${patientId}`} target="_blank" rel="noreferrer">
          Abrir cadastro do cliente
        </a>
      )}
    </div>
  );
}
