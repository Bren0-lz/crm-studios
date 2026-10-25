import type { AdminUser, PatientTag } from "@crm/contracts";
import {
  type LucideIcon,
  Building2,
  CalendarDays,
  MapPin,
  PanelLeft,
  HeartHandshake,
  PackageOpen,
  Stethoscope,
  Tags,
  Users,
} from "lucide-react";
import { ApiClientError } from "../../api";
import { shortDate } from "../../shared/lib/formatting";
import type { RelationshipDeadlineKey, SettingsTabKey } from "./types";

export function isoDateLabel(value: string) {
  return shortDate.format(new Date(`${value}T12:00:00`));
}

export function parsePercentage(text: string) {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : Number.NaN;
}

export const percentageLabel = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

export function percentageText(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

export const relationshipDeadlineFields: Array<{
  key: RelationshipDeadlineKey;
  label: string;
  min: number;
}> = [
  {
    key: "birthdayDaysAhead",
    label: "Aniversário: avisar quantos dias antes",
    min: 0,
  },
  { key: "singleNoReturnDays", label: "Veio uma vez: dias sem voltar", min: 1 },
  {
    key: "planExpiringDays",
    label: "Plano acabando: avisar quantos dias antes do fim",
    min: 1,
  },
  {
    key: "lowBalanceSessions",
    label: "Saldo baixo: sessões restantes",
    min: 0,
  },
  {
    key: "expiredWithBalanceDays",
    label: "Vencido com saldo: até quantos dias após vencer",
    min: 1,
  },
  {
    key: "treatmentPausedDays",
    label: "Tratamento parado: dias sem atendimento",
    min: 1,
  },
  {
    key: "repeatedNoShowCount",
    label: "Faltas seguidas: número de faltas",
    min: 1,
  },
  {
    key: "repeatedNoShowWindowDays",
    label: "Faltas seguidas: período em dias",
    min: 1,
  },
  {
    key: "formerClientMinDays",
    label: "Ex-cliente: cancelou há pelo menos (dias)",
    min: 0,
  },
  {
    key: "formerClientMaxDays",
    label: "Ex-cliente: cancelou há no máximo (dias)",
    min: 1,
  },
];

export const settingsTabs: Array<{
  key: SettingsTabKey;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}> = [
  {
    key: "clinic",
    label: "Clínica",
    title: "Dados da clínica",
    description:
      "Mantenha a identificação e os canais de contato da sua clínica atualizados.",
    icon: Building2,
    adminOnly: true,
  },
  {
    key: "users",
    label: "Usuários",
    title: "Usuários",
    description: "Gerencie a equipe, os acessos e as permissões individuais.",
    icon: Users,
    adminOnly: true,
  },
  {
    key: "branches",
    label: "Filiais",
    title: "Filiais",
    description:
      "Cadastre as unidades da rede; cada uma tem agenda, equipe e financeiro próprios.",
    icon: MapPin,
    adminOnly: true,
  },
  {
    key: "menu",
    label: "Abas do menu",
    title: "Abas do menu",
    description:
      "Renomeie as abas do menu lateral para combinar com a rotina da clínica.",
    icon: PanelLeft,
    adminOnly: true,
  },
  {
    key: "plans",
    label: "Planos",
    title: "Planos",
    description: "Organize o catálogo de planos disponíveis para novas vendas.",
    icon: PackageOpen,
  },
  {
    key: "holidays",
    label: "Feriados",
    title: "Feriados",
    description: "Defina as datas em que a clínica não realiza atendimentos.",
    icon: CalendarDays,
    adminOnly: true,
  },
  {
    key: "tags",
    label: "Etiquetas",
    title: "Etiquetas",
    description:
      "Organize os clientes com etiquetas para filtros e comunicações.",
    icon: Tags,
  },
  {
    key: "catalogs",
    label: "Cadastros",
    title: "Cadastros da clínica",
    description:
      "Listas compartilhadas de clientes, comercial, produtos, fornecedores e clínico.",
    icon: Tags,
  },
  {
    key: "registry",
    label: "Serviços e salas",
    title: "Serviços, salas e profissionais",
    description:
      "Cadastre os serviços, as salas e os profissionais usados na agenda.",
    icon: Stethoscope,
  },
  {
    key: "relationship",
    label: "Contatos sugeridos",
    title: "Prazos e mensagens",
    description:
      "Configure quando entrar em contato e as mensagens sugeridas para cada situação.",
    icon: HeartHandshake,
  },
];

/** Aba aberta por `/configuracoes?secao=`; os nomes antigos continuam valendo. */
const sectionTabs: Record<string, SettingsTabKey> = {
  filiais: "branches",
  abas: "menu",
  etiquetas: "tags",
  planos: "plans",
  cadastros: "catalogs",
  servicos: "registry",
  salas: "registry",
  profissionais: "registry",
};

export function settingsTabFromSection(
  section: string | null,
): SettingsTabKey | undefined {
  return section ? sectionTabs[section] : undefined;
}

export function sortPatientTags(tags: PatientTag[]) {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function userAccessSummary(user: AdminUser) {
  if (user.role === "admin") return "Acesso total";
  const view = user.modules.length;
  if (view === 0) return "Nenhum módulo (só Visão geral)";
  return `Vê ${view} ${view === 1 ? "módulo" : "módulos"} · ${user.permissions?.length ?? 0} permissões`;
}

export function userCommissionSummary(user: AdminUser) {
  const agenda = user.professionalId
    ? `Agenda: ${user.professionalName ?? "profissional ligado"}${user.professional?.active === false ? " (inativo)" : ""}`
    : "Sem profissional da agenda";
  const commission =
    user.commissionPercentage === undefined
      ? "Sem comissão vigente"
      : user.commissionKind === "fixed"
        ? `Comissão fixa ${(user.commissionFixedAmountInCents ?? 0) / 100} reais`
        : `Comissão ${percentageLabel.format(user.commissionPercentage)}%`;
  return `${agenda} · ${commission}`;
}

export function userSaveErrorMessage(cause: unknown) {
  if (cause instanceof ApiClientError && cause.code === "LAST_ADMIN") {
    return "A clínica precisa de pelo menos um admin ativo. Torne outro usuário admin antes de rebaixar ou desativar este.";
  }
  return (cause as Error).message;
}
