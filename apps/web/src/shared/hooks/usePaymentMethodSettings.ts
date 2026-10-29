import type { PaymentMethodSettings } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

/**
 * Parcelamento por forma de pagamento (Configurações › Formas de pagamento). `null` enquanto
 * carrega ou se a leitura falhar: a tela não limita e a API recusa o que passar do configurado.
 */
export function usePaymentMethodSettings() {
  const [settings, setSettings] = useState<PaymentMethodSettings | null>(null);
  useEffect(() => {
    let active = true;
    api
      .paymentMethodSettings()
      .then((data) => {
        // Resposta fora do formato (ex.: API antiga) conta como sem configuração.
        if (active) setSettings(Array.isArray(data?.methods) ? data : null);
      })
      .catch(() => {
        if (active) setSettings(null);
      });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
