import {
  type AppModule,
  type NavTab,
  defaultNavTabLabels,
} from "@crm/contracts";
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
  Hourglass,
  LayoutDashboard,
  PackageOpen,
  Settings,
  ShoppingBag,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";

type NavItem = {
  /** Chave da aba: o admin pode renomeá-la em Configurações. */
  tab: NavTab;
  to: string;
  /** Nome padrão; o menu usa o nome salvo pela clínica quando houver. */
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** Módulo exigido; sem módulo (Visão geral) o item aparece para todos. */
  module?: AppModule;
};

export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Rotina",
    items: [
      {
        tab: "dashboard",
        to: "/",
        label: defaultNavTabLabels.dashboard,
        icon: LayoutDashboard,
      },
      {
        tab: "agenda",
        to: "/agenda",
        label: defaultNavTabLabels.agenda,
        icon: CalendarDays,
        module: "agenda",
      },
      {
        tab: "groups",
        to: "/turmas",
        label: defaultNavTabLabels.groups,
        icon: Users,
        module: "groups",
      },
      {
        tab: "patients",
        to: "/clientes",
        label: defaultNavTabLabels.patients,
        icon: Users,
        module: "patients",
      },
      {
        tab: "plans",
        to: "/planos",
        label: defaultNavTabLabels.plans,
        icon: PackageOpen,
        module: "plans",
      },
      {
        tab: "clinical",
        to: "/prontuarios",
        label: defaultNavTabLabels.clinical,
        icon: Stethoscope,
        module: "clinical",
      },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      {
        tab: "crm",
        to: "/comercial",
        label: defaultNavTabLabels.crm,
        icon: Columns3,
        module: "crm",
      },
      {
        tab: "events",
        to: "/eventos",
        label: defaultNavTabLabels.events,
        icon: CalendarDays,
        module: "events",
      },
      {
        tab: "relationship",
        to: "/relacionamento",
        label: defaultNavTabLabels.relationship,
        icon: HeartHandshake,
        module: "relationship",
      },
      {
        tab: "waitlist",
        to: "/lista-de-espera",
        label: defaultNavTabLabels.waitlist,
        icon: Hourglass,
        module: "waitlist",
      },
      {
        tab: "communications",
        to: "/comunicacoes",
        label: defaultNavTabLabels.communications,
        icon: Bell,
        module: "communications",
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        tab: "contracts",
        to: "/contratos",
        label: defaultNavTabLabels.contracts,
        icon: FileText,
        module: "contracts",
      },
      {
        tab: "sales",
        to: "/vendas",
        label: defaultNavTabLabels.sales,
        icon: ShoppingBag,
        module: "patients",
      },
      {
        tab: "finance",
        to: "/financeiro",
        label: defaultNavTabLabels.finance,
        icon: CircleDollarSign,
        module: "finance",
      },
      {
        tab: "reports",
        to: "/relatorios",
        label: defaultNavTabLabels.reports,
        icon: BarChart3,
        module: "reports",
      },
      {
        tab: "history",
        to: "/historico",
        label: defaultNavTabLabels.history,
        icon: FileClock,
        module: "history",
      },
      {
        tab: "settings",
        to: "/configuracoes",
        label: defaultNavTabLabels.settings,
        icon: Settings,
        module: "settings",
      },
      {
        tab: "profile",
        to: "/perfil",
        label: defaultNavTabLabels.profile,
        icon: UserRound,
      },
    ],
  },
];
