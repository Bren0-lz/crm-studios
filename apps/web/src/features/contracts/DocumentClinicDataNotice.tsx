import { documentClinicFieldsMessage } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";

/** Modelo que usa dado da clínica sem cadastro (CNPJ, endereço…): o contrato não é emitido. */
export function DocumentClinicDataNotice({
  missing,
}: {
  missing: ReadonlyArray<{ name: string }>;
}) {
  const { user } = useAuthorization();
  return (
    <div className="document-data-notice" role="alert">
      <strong>Dados da clínica faltando neste contrato</strong>
      <p>{documentClinicFieldsMessage(missing)}</p>
      {user?.role === "admin" && (
        <a href="/configuracoes" target="_blank" rel="noreferrer">
          Abrir Configurações › Clínica
        </a>
      )}
    </div>
  );
}
