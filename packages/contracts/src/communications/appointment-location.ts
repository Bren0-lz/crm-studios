import { branchAddressLine, type Branch } from "../branches/types.js";
import { fillCampaignMessage } from "./model.js";

/** Um endereço incompleto não deve direcionar o cliente a outra unidade. */
export function appointmentLocationVariables(branch?: Branch) {
  const endereco =
    branch?.street?.trim() && branch.city?.trim()
      ? branchAddressLine(branch)
      : "";
  return {
    endereco,
    link_mapa: endereco
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
      : "",
  };
}

/** Mesma interpolação na fila e na prévia; linhas de endereço ausente não são enviadas. */
export function fillAutoCampaignMessage(
  body: string,
  fullName: string,
  vars: Record<string, string>,
) {
  const text = body
    .split("\n")
    .filter(
      (line) =>
        !["endereco", "link_mapa"].some(
          (key) =>
            vars[key] === "" &&
            new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(line),
        ),
    )
    .join("\n");
  return fillCampaignMessage(text, fullName).replace(
    /\{\{\s*([a-z_]+)\s*\}\}/g,
    (match, name: string) => vars[name] ?? match,
  );
}
