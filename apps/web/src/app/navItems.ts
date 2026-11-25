import {
  type AppModule,
  type NavTab,
  defaultNavTabLabels,
  navMenu,
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

const icons: Record<NavTab, LucideIcon> = {
  dashboard: LayoutDashboard,
  agenda: CalendarDays,
  groups: Users,
  patients: Users,
  plans: PackageOpen,
  clinical: Stethoscope,
  crm: Columns3,
  events: CalendarDays,
  relationship: HeartHandshake,
  waitlist: Hourglass,
  communications: Bell,
  contracts: FileText,
  sales: ShoppingBag,
  finance: CircleDollarSign,
  reports: BarChart3,
  history: FileClock,
  settings: Settings,
  profile: UserRound,
};

// A estrutura (grupos, endereços, módulos) mora em @crm/contracts para a API usar também.
export const navGroups: Array<{ label: string; items: NavItem[] }> =
  navMenu.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      ...item,
      label: defaultNavTabLabels[item.tab],
      icon: icons[item.tab],
    })),
  }));
