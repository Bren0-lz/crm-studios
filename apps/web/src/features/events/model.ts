import { formatPhone, splitPhone } from "@crm/contracts";

/** Preserva contatos fora do padrão brasileiro, aceitos no cadastro do evento. */
export function eventPhone(value: string) {
  const { ddd, number } = splitPhone(value);
  return ddd ? formatPhone(ddd + number) : value || "Não informado";
}

/** Converte um instante para o campo local no fuso da clínica, não do navegador. */
export function eventDateTime(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function eventStartsAt(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Informe a data e o horário do evento.");
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Informe uma data válida.");
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = Date.parse(
      `${eventDateTime(new Date(instant).toISOString(), timezone)}:00Z`,
    );
    instant += wall - represented;
  }
  const iso = new Date(instant).toISOString();
  if (eventDateTime(iso, timezone) !== value)
    throw new Error(
      "Horário inválido no fuso da clínica. Escolha outro horário.",
    );
  return iso;
}

/** "09 de nov. às 10:00" no fuso da clínica (contato e avaliação do participante). */
export function eventMoment(iso: string, timezone: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} às ${time}`;
}

/** Nome do arquivo da exportação: `participantes-<evento sem acento>.xlsx`. */
export function eventExportFileName(eventName: string) {
  const slug = eventName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `participantes${slug ? `-${slug}` : ""}.xlsx`;
}
