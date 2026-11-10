import {
  type PlanTemplate,
  type Service,
  planTypeLabels,
  withPrefix,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency } from "../../shared/lib/formatting";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { planKindLabels } from "../plans/index";
import { PlanTemplateModal } from "./PlanTemplateModal";

export function PlanTemplatesContent() {
  const { can } = useAuthorization();
  const [items, setItems] = useState<PlanTemplate[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<PlanTemplate | "new" | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([api.planTemplates(), api.services()])
      .then(([templates, serviceData]) => {
        if (active) {
          setItems(templates);
          setServices(serviceData);
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  function replace(item: PlanTemplate) {
    setItems((current) =>
      [
        item,
        ...(current ?? []).filter((existing) => existing.id !== item.id),
      ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    );
  }
  useSettingsBusy(savingId !== null);
  async function toggle(item: PlanTemplate) {
    if (savingId) return;
    setSavingId(item.id);
    setError("");
    setNotice("");
    try {
      replace(await api.updatePlanTemplate(item.id, { active: !item.active }));
      setNotice(item.active ? "Plano desativado." : "Plano ativado.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSavingId(null);
    }
  }
  return (
    <>
      <div className="settings-toolbar">
        <p className="muted-copy">
          Defina os planos disponíveis para novas vendas. Alterações não afetam
          contratos já vendidos.
        </p>
        {items !== null && can("settings.plans_create") && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setEditing("new")}
          >
            <Plus size={17} /> Cadastrar plano
          </button>
        )}
      </div>
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => {
              setError("");
              setAttempt((current) => current + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {items === null ? (
        !error && <LoadingBlock />
      ) : (
        <>
          {items.length === 0 ? (
            <EmptyState
              title="Nenhum plano cadastrado"
              copy="Cadastre nome, valor e serviços para disponibilizar um plano nas novas vendas."
            />
          ) : (
            <div className="plan-template-list">
              {items.map((item) => (
                <article key={item.id} className="admin-user-row">
                  <div className="admin-user-info">
                    <div className="settings-plan-heading">
                      <strong>{item.name}</strong>
                      <span className="settings-plan-price">
                        {currency.format(item.totalValueInCents / 100)}
                      </span>
                    </div>
                    <small>
                      {[
                        item.services.length
                          ? item.services
                              .map(
                                (entry) =>
                                  `${services.find((service) => service.id === entry.serviceId)?.name ?? "Serviço"}: ${entry.sessionsPerWeek ? `${entry.sessionsPerWeek}x por semana · ` : ""}${entry.totalSessions} sessões`,
                              )
                              .join(" · ")
                          : "Composição incompleta — edite para corrigir",
                        item.planType
                          ? planTypeLabels[item.planType]
                          : item.kind
                            ? planKindLabels[item.kind]
                            : null,
                        item.maxInstallments === 1
                          ? "Só à vista"
                          : item.maxInstallments
                            ? `Parcela em até ${item.maxInstallments}x`
                            : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {!item.active && (
                      <span className="status-pill cancelled">Inativo</span>
                    )}
                  </div>
                  {can("settings.plans_update") && (
                    <div className="admin-user-actions">
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        disabled={savingId !== null}
                        onClick={() => setEditing(item)}
                        aria-label={`Editar ${withPrefix("plano", item.name)}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={
                          item.active
                            ? "danger-button button-sm"
                            : "secondary-button button-sm"
                        }
                        disabled={savingId !== null}
                        onClick={() => void toggle(item)}
                        aria-label={`${item.active ? "Desativar" : "Ativar"} ${withPrefix("plano", item.name)}`}
                      >
                        {item.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {editing && (
        <PlanTemplateModal
          item={editing === "new" ? null : editing}
          services={services}
          onServiceCreated={(service) =>
            setServices((current) => [...current, service])
          }
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            replace(item);
            setNotice("Plano salvo.");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
