import {
  type PaymentMethod,
  type PaymentMethodSettings,
  paymentMethodLabels,
  paymentMethodMaxInstallments,
} from "@crm/contracts";
import { useEffect } from "react";

/**
 * Parcelas do pagamento na própria forma (ex.: cartão em 3x), até o máximo configurado em
 * Configurações › Formas de pagamento. Some quando a forma só aceita à vista (ou enquanto a
 * configuração carrega) e volta a 1 ao trocar para uma forma com limite menor.
 */
export function PaymentInstallmentsSelect({
  method,
  settings,
  value,
  onChange,
  className,
}: {
  method: PaymentMethod;
  settings: PaymentMethodSettings | null;
  value: number;
  onChange: (installments: number) => void;
  className?: string;
}) {
  const max = settings ? paymentMethodMaxInstallments(settings, method) : 1;
  useEffect(() => {
    if (value > max) onChange(1);
  }, [value, max, onChange]);
  if (max <= 1) return null;
  return (
    <label className={className}>
      Parcelamento ({paymentMethodLabels[method]})
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: max }, (_, index) => index + 1).map((count) => (
          <option key={count} value={count}>
            {count === 1 ? "À vista" : `${count}x`}
          </option>
        ))}
      </select>
    </label>
  );
}
