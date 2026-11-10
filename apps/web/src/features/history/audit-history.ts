import {
  appModuleLabels,
  auditChangesOf,
  historyAction,
  patientExportColumnLabels,
  permissionCatalog,
  userRoleLabels,
  type AdminAuditEvent,
} from "@crm/contracts";

const categoryLabels: Record<string, string> = {
  user: "Usuários",
  clinic: "Dados da clínica",
  patient_tag: "Etiquetas de clientes",
  plan_template: "Catálogo de planos",
  patient: "Clientes",
};

export interface AuditField {
  label: string;
  value: string;
}

function labelFor(
  labels: Readonly<Record<string, string>>,
  key: string,
  fallback: string,
) {
  return Object.hasOwn(labels, key) ? labels[key]! : fallback;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...new Set(value)]
    : undefined;
}

function permissionLabel(key: string) {
  const permission = permissionCatalog.find((item) => item.key === key);
  if (!permission) return "Acesso não identificado";
  return key.endsWith(".view")
    ? `Visualizar ${appModuleLabels[permission.module]}`
    : `${appModuleLabels[permission.module]}: ${permission.name}`;
}

export function formatAuditEvent(event: AdminAuditEvent) {
  const details: AuditField[] = [];
  const metadata =
    event.metadata &&
    typeof event.metadata === "object" &&
    !Array.isArray(event.metadata)
      ? event.metadata
      : {};
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim())
      details.push({ label, value });
  };
  const addList = (
    label: string,
    values: string[],
    describe: (key: string) => string,
  ) => add(label, values.length ? values.map(describe).join("; ") : "Nenhum");

  switch (event.action) {
    case "plan_template.created":
    case "plan_template.updated": {
      add("Plano", metadata.name);
      if (
        typeof metadata.totalValueInCents === "number" &&
        Number.isSafeInteger(metadata.totalValueInCents)
      )
        add(
          "Valor",
          (metadata.totalValueInCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
        );
      if (typeof metadata.active === "boolean")
        add("Situação", metadata.active ? "Ativo" : "Inativo");
      break;
    }
    case "user.created":
    case "user.updated":
      add("E-mail do usuário", metadata.email);
      if (typeof metadata.role === "string")
        add(
          "Perfil",
          metadata.role === "admin"
            ? "Administrador"
            : labelFor(
                userRoleLabels,
                metadata.role,
                "Perfil não identificado",
              ),
        );
      if (typeof metadata.active === "boolean")
        add("Situação", metadata.active ? "Ativo" : "Desativado");
      break;
    case "users.dashboard_access_updated":
      if (typeof metadata.dashboardAccess === "boolean")
        add(
          "Painel de vendas",
          metadata.dashboardAccess ? "Acesso liberado" : "Acesso removido",
        );
      break;
    case "users.permissions_updated": {
      const current = strings(metadata.permissions);
      const previous = strings(metadata.previousPermissions);
      if (current && previous) {
        addList(
          "Acessos concedidos",
          current.filter((key) => !previous.includes(key)),
          permissionLabel,
        );
        addList(
          "Acessos removidos",
          previous.filter((key) => !current.includes(key)),
          permissionLabel,
        );
      } else if (current) {
        addList("Acessos permitidos", current, permissionLabel);
      } else {
        for (const [key, label] of [
          ["modules", "Áreas disponíveis"],
          ["editModules", "Áreas com alterações permitidas"],
        ] as const) {
          const modules = strings(metadata[key]);
          if (modules)
            addList(label, modules, (name) =>
              labelFor(appModuleLabels, name, "Área não identificada"),
            );
        }
      }
      break;
    }
    case "users.commission_updated":
      for (const [key, label] of [
        ["previousPercentage", "Percentual anterior"],
        ["percentage", "Novo percentual"],
      ] as const) {
        const value = metadata[key];
        if (
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 100
        )
          add(
            label,
            `${value.toLocaleString("pt-BR", { maximumFractionDigits: 20 })}%`,
          );
      }
      if (
        typeof metadata.effectiveFrom === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(metadata.effectiveFrom)
      ) {
        const date = new Date(`${metadata.effectiveFrom}T12:00:00Z`);
        if (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === metadata.effectiveFrom
        )
          add(
            "Válida a partir de",
            date.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          );
      }
      break;
    case "users.professional_updated":
      if (metadata.professionalId === null)
        add("Vínculo", "Sem profissional vinculado");
      else if (
        typeof metadata.professionalId === "string" &&
        metadata.professionalId
      )
        add("Vínculo", "Profissional vinculado ao usuário");
      break;
    case "patient_tag.created":
    case "patient_tag.updated":
    case "patient_tag.deleted":
      add("Etiqueta", metadata.name);
      add("Nome anterior", metadata.previousName);
      if (
        typeof metadata.patientsUpdated === "number" &&
        Number.isSafeInteger(metadata.patientsUpdated) &&
        metadata.patientsUpdated >= 0
      )
        add(
          "Clientes atualizados",
          metadata.patientsUpdated.toLocaleString("pt-BR"),
        );
      break;
    case "patient.trashed":
    case "patient.restored":
    case "patient.purged":
    case "lead.trashed":
    case "lead.restored":
    case "lead.purged":
    case "appointment.trashed":
    case "appointment.restored":
    case "appointment.purged":
    case "patient_plan.trashed":
    case "patient_plan.restored":
    case "patient_plan.purged":
      add("Item", metadata.title);
      if (
        typeof metadata.removedCount === "number" &&
        Number.isSafeInteger(metadata.removedCount) &&
        metadata.removedCount > 0
      )
        add(
          "Registros apagados junto",
          metadata.removedCount.toLocaleString("pt-BR"),
        );
      break;
    case "patients.exported": {
      if (
        typeof metadata.count === "number" &&
        Number.isSafeInteger(metadata.count) &&
        metadata.count >= 0
      )
        add("Clientes exportados", metadata.count.toLocaleString("pt-BR"));
      if (metadata.format === "xlsx")
        add("Formato do arquivo", "Planilha do Excel");
      if (metadata.format === "csv")
        add("Formato do arquivo", "Arquivo CSV (planilha)");
      const columns = strings(metadata.columns);
      if (columns)
        addList("Informações exportadas", columns, (key) =>
          labelFor(
            patientExportColumnLabels,
            key,
            "Informação não identificada",
          ),
        );
      break;
    }
  }

  const date = new Date(event.createdAt);
  if (event.module !== "clinical") add("Registro", metadata.subjectName);
  // Edições: cada campo alterado como "antes → depois" e o motivo informado.
  for (const change of auditChangesOf(metadata))
    details.push({
      label: change.label,
      value: `${change.before ?? "(vazio)"} → ${change.after ?? "(vazio)"}`,
    });
  add("Motivo da alteração", metadata.reason);
  return {
    title:
      historyAction(event.action)?.label ??
      event.description ??
      "Alteração registrada",
    category: event.module
      ? appModuleLabels[event.module]
      : labelFor(categoryLabels, event.entityType, "Outros registros"),
    actor:
      event.actorName?.trim() ||
      (event.actorUserId
        ? "Usuário não identificado"
        : metadata.importedHistory || metadata.actorUnavailable
          ? "Responsável não registrado"
          : "Sistema"),
    date: Number.isFinite(date.getTime())
      ? date.toLocaleString("pt-BR")
      : "Não registrado",
    details,
  };
}
