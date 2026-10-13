import type { AdminAuditEvent } from "@crm/contracts";
import { useId, useState } from "react";
import { formatAuditEvent, type AuditField } from "../../audit-history";
import { Modal } from "../../shared/components/Modal";
import { AuditFields } from "./AuditFields";

export function HistoryDetailsModal({
  event,
  onClose,
}: {
  event: AdminAuditEvent;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"summary" | "technical">("summary");
  const id = useId();
  const summary = formatAuditEvent(event);
  const tabs = [
    { key: "summary", label: "Resumo" },
    { key: "technical", label: "Detalhes técnicos" },
  ] as const;
  const recorded = (value: string | undefined) =>
    value?.trim() ? value : "Não registrado";
  const technicalFields: AuditField[] = [
    { label: "ID do evento", value: recorded(event.id) },
    { label: "Código da ação", value: recorded(event.action) },
    { label: "Tipo do registro afetado", value: recorded(event.entityType) },
    { label: "ID do registro afetado", value: recorded(event.entityId) },
    { label: "ID da clínica", value: recorded(event.clinicId) },
    { label: "Responsável", value: summary.actor },
    { label: "ID do responsável", value: recorded(event.actorUserId) },
    { label: "Data e hora originais", value: recorded(event.createdAt) },
    { label: "Endereço IP", value: recorded(event.ipAddress) },
  ];
  return (
    <Modal
      eyebrow="Histórico"
      title="Detalhes da alteração"
      subtitle={summary.title}
      initialFocus='[role="tab"][aria-selected="true"]'
      onClose={onClose}
    >
      <div className="audit-details">
        <div
          className="audit-tabs"
          role="tablist"
          aria-label="Informações da alteração"
        >
          {tabs.map(({ key, label }, index) => (
            <button
              key={key}
              type="button"
              className="secondary-button"
              role="tab"
              id={`${id}-${key}-tab`}
              aria-controls={`${id}-${key}-panel`}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(keyboardEvent) => {
                let next: number;
                switch (keyboardEvent.key) {
                  case "ArrowRight":
                    next = (index + 1) % tabs.length;
                    break;
                  case "ArrowLeft":
                    next = (index + tabs.length - 1) % tabs.length;
                    break;
                  case "Home":
                    next = 0;
                    break;
                  case "End":
                    next = tabs.length - 1;
                    break;
                  default:
                    return;
                }
                keyboardEvent.preventDefault();
                setTab(tabs[next]!.key);
                document
                  .getElementById(`${id}-${tabs[next]!.key}-tab`)
                  ?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-summary-panel`}
          aria-labelledby={`${id}-summary-tab`}
          hidden={tab !== "summary"}
          tabIndex={0}
        >
          <AuditFields
            fields={[
              { label: "O que aconteceu", value: summary.title },
              { label: "Área", value: summary.category },
              { label: "Quem realizou", value: summary.actor },
              { label: "Quando", value: summary.date },
              ...summary.details,
            ]}
          />
        </div>
        <div
          role="tabpanel"
          id={`${id}-technical-panel`}
          aria-labelledby={`${id}-technical-tab`}
          hidden={tab !== "technical"}
          tabIndex={0}
        >
          <AuditFields fields={technicalFields} />
          <h3>Metadados completos</h3>
          <pre className="audit-json">
            {JSON.stringify(event.metadata, null, 2) ?? "Não registrado"}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
