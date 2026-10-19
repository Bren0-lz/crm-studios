import type { Appointment, PermissionKey } from "@crm/contracts";
import type { ReactNode } from "react";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  permission?: PermissionKey;
};

export type DashboardAppointmentAction = {
  kind: "details" | "edit" | "cancel" | "reschedule" | "history";
  appointment: Appointment;
};

export type NavigationGuard = (to: string) => boolean;
