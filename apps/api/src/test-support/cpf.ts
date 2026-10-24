import { randomInt } from "node:crypto";

let sequence = randomInt(100000000, 900000000);

/** CPF sintético válido e distinto para cada cadastro criado nos testes. */
export function nextTestCpf(): string {
  const digits = String(sequence++).split("").map(Number);
  for (const weight of [10, 11]) {
    const remainder =
      digits.reduce((sum, digit, index) => sum + digit * (weight - index), 0) %
      11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}
