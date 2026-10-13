import { type AppModule, appModuleLabels } from "@crm/contracts";
import { LockKeyhole } from "lucide-react";

export function ReadOnlyNotice({
  module,
  copy,
}: {
  module: AppModule;
  copy?: string;
}) {
  return (
    <p className="read-only-notice" role="note">
      <LockKeyhole size={16} aria-hidden="true" />
      <span>
        {copy ??
          `Seu acesso a ${appModuleLabels[module]} é só de consulta. Para criar, editar ou excluir, peça a um admin a permissão de edição.`}
      </span>
    </p>
  );
}
