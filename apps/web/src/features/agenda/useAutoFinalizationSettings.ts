import type { AutoFinalizationSettings } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

/**
 * Finalização automática da clínica, para mostrar os atalhos de concluídos. Falha na leitura
 * conta como desligada: os atalhos são só conveniência e não podem travar a tela.
 */
export function useAutoFinalizationSettings() {
  const [settings, setSettings] = useState<AutoFinalizationSettings | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    api
      .autoFinalizationSettings()
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch(() => {
        if (active) setSettings(null);
      });
    return () => {
      active = false;
    };
  }, []);
  return settings?.enabled === true ? settings : null;
}
