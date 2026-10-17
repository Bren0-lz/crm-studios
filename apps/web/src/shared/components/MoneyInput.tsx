import { type InputHTMLAttributes, useState } from "react";
import { centsToMoneyText, parseMoneyToCents } from "../lib/formatting";

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  /** Valor em centavos; null (ou 0 sem digitação) mostra o campo vazio. */
  valueInCents: number | null;
  /** Centavos do texto digitado; null quando o campo está vazio ou inválido. */
  onChange: (cents: number | null) => void;
};

/**
 * Campo monetário único (R$): aceita vírgula ou ponto, permite apagar o campo e formata ao
 * sair ("45,9" → "45,90"). Substitui `input type="number"`, que corrompia a digitação.
 */
export function MoneyInput({
  valueInCents,
  onChange,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [text, setText] = useState(() =>
    valueInCents ? centsToMoneyText(valueInCents) : "",
  );
  const [previous, setPrevious] = useState(valueInCents);
  // Valor trocado de fora (reset do formulário, troca de serviço): mostra o novo valor.
  if (valueInCents !== previous) {
    setPrevious(valueInCents);
    if ((parseMoneyToCents(text) ?? 0) !== (valueInCents ?? 0))
      setText(valueInCents ? centsToMoneyText(valueInCents) : "");
  }
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={props.placeholder ?? "0,00"}
      value={text}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d.,]/g, "");
        setText(next);
        onChange(parseMoneyToCents(next));
      }}
      onBlur={(event) => {
        const cents = parseMoneyToCents(text);
        if (cents !== null) setText(centsToMoneyText(cents));
        onBlur?.(event);
      }}
    />
  );
}
