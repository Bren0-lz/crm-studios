import { type InputHTMLAttributes, useState } from "react";
import { centsToMoneyText, parseMoneyToCents } from "../lib/formatting";

/** Até 999.999.999,99: evita números além do que o campo consegue mostrar. */
const MAX_DIGITS = 11;

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  /** Valor em centavos; null (ou 0 sem digitação) mostra o campo vazio. */
  valueInCents: number | null;
  /** Centavos do texto digitado; null quando o campo está vazio. */
  onChange: (cents: number | null) => void;
};

/**
 * Campo monetário único (R$) com máscara: cada dígito entra pela direita, como nos apps de
 * banco ("4" → "0,04", "4590" → "45,90", "123456" → "1.234,56"), sem digitar vírgula nem
 * ponto. Apagar tudo (ou o último dígito de "0,0X") deixa o campo vazio.
 */
export function MoneyInput({
  valueInCents,
  onChange,
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
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? "0,00"}
      value={text}
      onChange={(event) => {
        const typed = event.target.value;
        const allDigits = typed.replace(/\D/g, "");
        const digits = allDigits.replace(/^0+/, "").slice(0, MAX_DIGITS);
        if (!allDigits || (!digits && typed.length < text.length)) {
          setText("");
          onChange(null);
          return;
        }
        const cents = Number(digits || "0");
        setText(centsToMoneyText(cents));
        onChange(cents);
      }}
    />
  );
}
