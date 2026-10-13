import type { AppModule } from "@crm/contracts";
import {
  type LucideIcon,
  BarChart3,
  Bell,
  CalendarDays,
  CircleDollarSign,
  Columns3,
  FileClock,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  PackageOpen,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";

export const navItems: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** Módulo exigido; sem módulo (Visão geral) o item aparece para todos. */
  module?: AppModule;
}> = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda" },
  { to: "/turmas", label: "Turmas", icon: Users, module: "groups" },
  { to: "/clientes", label: "Clientes", icon: Users, module: "patients" },
  {
    to: "/planos",
    label: "Planos e sessões",
    icon: PackageOpen,
    module: "plans",
  },
  { to: "/comercial", label: "CRM comercial", icon: Columns3, module: "crm" },
  {
    to: "/relacionamento",
    label: "Contatos sugeridos",
    icon: HeartHandshake,
    module: "relationship",
  },
  {
    to: "/comunicacoes",
    label: "Comunicações",
    icon: Bell,
    module: "communications",
  },
  { to: "/contratos", label: "Contratos", icon: FileText, module: "contracts" },
  {
    to: "/prontuarios",
    label: "Prontuários",
    icon: Stethoscope,
    module: "clinical",
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    icon: CircleDollarSign,
    module: "finance",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    module: "reports",
  },
  { to: "/historico", label: "Histórico", icon: FileClock, module: "history" },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    module: "settings",
  },
];
