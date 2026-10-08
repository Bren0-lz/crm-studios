import {
  appModuleLabels,
  patientExportColumnLabels,
  permissionCatalog,
  userRoleLabels,
  type AdminAuditEvent,
} from "@crm/contracts";

const actionLabels: Record<string, string> = {
  "user.created": "Usuário cadastrado",
  "user.updated": "Usuário atualizado",
  "user.password_reset": "Senha redefinida",
  "users.permissions_updated": "Permissões de acesso alteradas",
  "users.commission_updated": "Comissão alterada",
  "users.professional_updated": "Vínculo com profissional alterado",
  "clinic.updated": "Dados da clínica atualizados",
  "patient_tag.created": "Etiqueta criada",
  "patient_tag.updated": "Etiqueta alterada",
  "patient_tag.deleted": "Etiqueta excluída",
  "patients.exported": "Lista de clientes exportada",
};
const categoryLabels: Record<string, string> = {
  user: "Usuários",
  clinic: "Dados da clínica",
  patient_tag: "Etiquetas de clientes",
  patient: "Clientes",
};

export interface AuditField {
  label: string;
  value: string;
}

function labelFor(labels: Readonly<Record<string, string>>, key: string, fallback: string) {
  return Object.hasOwn(labels, key) ? labels[key]! : fallback;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...new Set(value)] : undefined;
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
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? event.metadata : {};
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) details.push({ label, value });
  };
  const addList = (label: string, values: string[], describe: (key: string) => string) =>
    add(label, values.length ? values.map(describe).join("; ") : "Nenhum");

  switch (event.action) {
    case "user.created":
    case "user.updated":
      add("E-mail do usuário", metadata.email);
      if (typeof metadata.role === "string")
        add("Perfil", metadata.role === "admin" ? "Administrador" : labelFor(userRoleLabels, metadata.role, "Perfil não identificado"));
      if (typeof metadata.active === "boolean") add("Situação", metadata.active ? "Ativo" : "Desativado");
      break;
    case "users.permissions_updated": {
      const current = strings(metadata.permissions);
      const previous = strings(metadata.previousPermissions);
      if (current && previous) {
        addList("Acessos concedidos", current.filter((key) => !previous.includes(key)), permissionLabel);
        addList("Acessos removidos", previous.filter((key) => !current.includes(key)), permissionLabel);
      } else if (current) {
        addList("Acessos permitidos", current, permissionLabel);
      } else {
        for (const [key, label] of [["modules", "Áreas disponíveis"], ["editModules", "Áreas com alterações permitidas"]] as const) {
          const modules = strings(metadata[key]);
          if (modules) addList(label, modules, (name) => labelFor(appModuleLabels, name, "Área não identificada"));
        }
      }
      break;
    }
    case "users.commission_updated":
      for (const [key, label] of [["previousPercentage", "Percentual anterior"], ["percentage", "Novo percentual"]] as const) {
        const value = metadata[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)
          add(label, `${value.toLocaleString("pt-BR", { maximumFractionDigits: 20 })}%`);
      }
      if (typeof metadata.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(metadata.effectiveFrom)) {
        const date = new Date(`${metadata.effectiveFrom}T12:00:00Z`);
        if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === metadata.effectiveFrom)
          add("Válida a partir de", date.toLocaleDateString("pt-BR", { timeZone: "UTC" }));
      }
      break;
    case "users.professional_updated":
      if (metadata.professionalId === null) add("Vínculo", "Sem profissional vinculado");
      else if (typeof metadata.professionalId === "string" && metadata.professionalId)
        add("Vínculo", "Profissional vinculado ao usuário");
      break;
    case "patient_tag.created":
    case "patient_tag.updated":
    case "patient_tag.deleted":
      add("Etiqueta", metadata.name);
      add("Nome anterior", metadata.previousName);
      if (typeof metadata.patientsUpdated === "number" && Number.isSafeInteger(metadata.patientsUpdated) && metadata.patientsUpdated >= 0)
        add("Clientes atualizados", metadata.patientsUpdated.toLocaleString("pt-BR"));
      break;
    case "patients.exported": {
      if (typeof metadata.count === "number" && Number.isSafeInteger(metadata.count) && metadata.count >= 0)
        add("Clientes exportados", metadata.count.toLocaleString("pt-BR"));
      if (metadata.format === "xlsx") add("Formato do arquivo", "Planilha do Excel");
      if (metadata.format === "csv") add("Formato do arquivo", "Arquivo CSV (planilha)");
      const columns = strings(metadata.columns);
      if (columns) addList("Informações exportadas", columns, (key) => labelFor(patientExportColumnLabels, key, "Informação não identificada"));
      break;
    }
  }

  const date = new Date(event.createdAt);
  return {
    title: labelFor(actionLabels, event.action, "Alteração registrada"),
    category: labelFor(categoryLabels, event.entityType, "Outros registros"),
    actor: event.actorName?.trim() || (event.actorUserId ? "Usuário não identificado" : "Sistema"),
    date: Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Não registrado",
    details,
  };
}
