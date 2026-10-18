import {
  type AppModule,
  type UserRole,
  effectiveEditModules,
  effectiveModules,
  legacyPermissions,
} from "@crm/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import { api } from "../api";

/**
 * Módulos dos perfis antigos, usados como atalho nos testes: a migração 0042 gravou exatamente
 * esses módulos nos usuários de recepção, fisioterapia e financeiro (que viraram "user").
 */
export const legacyProfiles: Record<
  string,
  { modules: AppModule[]; editModules: AppModule[] }
> = {
  reception: {
    modules: [
      "agenda",
      "groups",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "settings",
    ],
    editModules: [
      "agenda",
      "groups",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
    ],
  },
  physiotherapist: {
    modules: ["agenda", "groups", "patients", "plans", "clinical"],
    editModules: ["agenda", "groups", "clinical"],
  },
  finance: {
    modules: [
      "agenda",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "finance",
      "reports",
      "settings",
    ],
    editModules: [
      "agenda",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "finance",
    ],
  },
};

/** Tipo e módulos efetivos de um perfil antigo (`owner` = admin). */
export function legacyAccess(role: string): {
  role: UserRole;
  modules: AppModule[];
  editModules: AppModule[];
} {
  if (role === "owner" || role === "admin")
    return {
      role: "admin",
      modules: effectiveModules("admin"),
      editModules: effectiveEditModules("admin"),
    };
  const profile = legacyProfiles[role];
  return {
    role: "user",
    modules: [...(profile?.modules ?? [])],
    editModules: [...(profile?.editModules ?? [])],
  };
}

/** Usuário logado gravado no localStorage, com os módulos do perfil (como login e /me devolvem). */
export function storedUser(user: {
  id: string;
  fullName: string;
  email: string;
  role: string;
}) {
  return JSON.stringify(
    withPermissions({ ...user, ...legacyAccess(user.role) }),
  );
}

export function withPermissions<
  T extends {
    role?: string;
    modules?: readonly string[];
    editModules?: readonly string[];
    permissions?: readonly import("@crm/contracts").PermissionKey[];
  },
>(user: T) {
  const access = legacyAccess(user.role ?? "user");
  const modules = (user.modules ?? access.modules) as AppModule[];
  const editModules = (user.editModules ?? access.editModules) as AppModule[];
  return {
    ...user,
    role: access.role,
    modules,
    editModules,
    permissions:
      user.permissions ?? legacyPermissions(access.role, modules, editModules),
  };
}

// Domain fixtures emulate a current /me response; session-specific tests supply their own response.
export const originalMe = api.me;

/** Seleciona uma aba de configurações e devolve seu painel. */
export async function openSettingsSection(...names: string[]) {
  let section: HTMLElement | null = null;
  for (const name of names) {
    const label =
      name === "Dados da clínica"
        ? "Clínica"
        : name === "Prazos e mensagens"
          ? "Contatos sugeridos"
          : name;
    const tab = await screen.findByRole("tab", { name: label });
    if (tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab);
    section = document.getElementById(tab.getAttribute("aria-controls")!);
  }
  return section!;
}

/** Etiqueta configurada (`GET /patient-tags`, T063). */
export function patientTag(name: string, color = "#64748b", patientCount = 0) {
  return {
    id: `tag-${name}`,
    clinicId: "11111111-1111-4111-8111-111111111111",
    name,
    color,
    patientCount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export async function fillAppointmentForm(
  dialog: HTMLElement,
  patientName?: string,
) {
  if (patientName) {
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: patientName },
      },
    );
    fireEvent.click(
      await within(dialog).findByRole("option", { name: patientName }),
    );
  }
  for (const label of ["Tipo", "Profissional", "Sala", "Serviço"]) {
    const select = within(dialog).getByLabelText(label) as HTMLSelectElement;
    if (!select.value)
      fireEvent.change(select, { target: { value: select.options[1]!.value } });
  }
  const date = within(dialog).getByRole("button", { name: "Data" });
  if (date.textContent?.includes("Selecionar")) {
    fireEvent.click(date);
    fireEvent.click(
      dialog.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar calendário" }),
    );
  }
  const time = within(dialog).getByLabelText("Horário");
  if (!(time as HTMLInputElement).value)
    fireEvent.change(time, { target: { value: "09:00" } });
}

export function relationshipSettingsFixture() {
  return {
    birthdayDaysAhead: 7,
    singleNoReturnDays: 60,
    planExpiringDays: 7,
    lowBalanceSessions: 2,
    expiredWithBalanceDays: 60,
    treatmentPausedDays: 30,
    repeatedNoShowCount: 2,
    repeatedNoShowWindowDays: 30,
    formerClientMinDays: 30,
    formerClientMaxDays: 90,
    messages: {
      birthday: "Parabéns, {{nome}}!",
      single_no_return: "Oi {{nome}}, sentimos sua falta.",
      plan_expiring: "Oi {{nome}}, seu plano está acabando.",
      low_balance: "x",
      expired_with_balance: "x",
      treatment_paused: "x",
      repeated_no_show: "x",
      former_client: "x",
      overdue_payment: "x",
      nps_detractor: "x",
    },
  };
}
