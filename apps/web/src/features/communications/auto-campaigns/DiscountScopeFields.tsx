import type { AutoCampaignProductOption, PlanTemplate } from "@crm/contracts";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import { LoadingBlock } from "../../../shared/components/LoadingBlock";
import type { AutoCampaignDraft, DiscountScope } from "./model";

type Remote<T> =
  { status: "loading" } | { status: "error" } | { status: "ready"; items: T[] };

interface Choice {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Onde o desconto da promoção vale: em planos (todos ou só os marcados) e/ou em produtos
 * (todos ou só os marcados).
 */
export function DiscountScopeFields({
  formId,
  draft,
  setDraft,
  plans,
}: {
  formId: string;
  draft: AutoCampaignDraft;
  setDraft: Dispatch<SetStateAction<AutoCampaignDraft>>;
  plans: Remote<PlanTemplate>;
}) {
  const products = useAutoCampaignProducts(draft.discountOnProducts);
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Onde o desconto vale</legend>
      <ScopeGroup
        formId={formId}
        label="Planos"
        allLabel="Todos os planos"
        selectedLabel="Só nos planos marcados"
        emptyLabel="Nenhum plano cadastrado."
        errorLabel="Não foi possível carregar os planos."
        enabled={draft.discountOnPlans}
        scope={draft.planScope}
        selected={draft.planTemplateIds}
        remote={plans}
        onEnabled={(discountOnPlans) =>
          setDraft((current) => ({ ...current, discountOnPlans }))
        }
        onScope={(planScope) =>
          setDraft((current) => ({ ...current, planScope }))
        }
        onSelected={(planTemplateIds) =>
          setDraft((current) => ({ ...current, planTemplateIds }))
        }
      />
      <ScopeGroup
        formId={formId}
        label="Produtos"
        allLabel="Todos os produtos"
        selectedLabel="Só nos produtos marcados"
        emptyLabel="Nenhum produto cadastrado."
        errorLabel="Não foi possível carregar os produtos."
        enabled={draft.discountOnProducts}
        scope={draft.productScope}
        selected={draft.productIds}
        remote={products}
        onEnabled={(discountOnProducts) =>
          setDraft((current) => ({ ...current, discountOnProducts }))
        }
        onScope={(productScope) =>
          setDraft((current) => ({ ...current, productScope }))
        }
        onSelected={(productIds) =>
          setDraft((current) => ({ ...current, productIds }))
        }
      />
    </fieldset>
  );
}

function ScopeGroup({
  formId,
  label,
  allLabel,
  selectedLabel,
  emptyLabel,
  errorLabel,
  enabled,
  scope,
  selected,
  remote,
  onEnabled,
  onScope,
  onSelected,
}: {
  formId: string;
  label: string;
  allLabel: string;
  selectedLabel: string;
  emptyLabel: string;
  errorLabel: string;
  enabled: boolean;
  scope: DiscountScope;
  selected: string[];
  remote: Remote<Choice>;
  onEnabled: (enabled: boolean) => void;
  onScope: (scope: DiscountScope) => void;
  onSelected: (ids: string[]) => void;
}) {
  const name = `${formId}-${label}-scope`;
  const choices =
    remote.status === "ready" ? activeOrSelected(remote.items, selected) : [];
  return (
    <div className="form-fieldset-grid">
      <label className="checkbox-field span-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        {label}
      </label>
      {enabled && (
        <>
          <label className="checkbox-field">
            <input
              type="radio"
              name={name}
              checked={scope === "all"}
              onChange={() => onScope("all")}
            />
            {allLabel}
          </label>
          <label className="checkbox-field">
            <input
              type="radio"
              name={name}
              checked={scope === "selected"}
              onChange={() => onScope("selected")}
            />
            {selectedLabel}
          </label>
          {scope === "selected" &&
            (remote.status === "loading" ? (
              <LoadingBlock />
            ) : remote.status === "error" ? (
              <p className="form-error span-2" role="alert">
                {errorLabel}
              </p>
            ) : choices.length === 0 ? (
              <p className="field-hint span-2">{emptyLabel}</p>
            ) : (
              choices.map((choice) => (
                <label className="checkbox-field" key={choice.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(choice.id)}
                    onChange={(event) =>
                      onSelected(
                        event.target.checked
                          ? [...selected, choice.id]
                          : selected.filter((id) => id !== choice.id),
                      )
                    }
                  />
                  {choice.name}
                </label>
              ))
            ))}
        </>
      )}
    </div>
  );
}

/** Produtos para o desconto (só ao ligar "Produtos"). */
function useAutoCampaignProducts(enabled: boolean) {
  const [state, setState] = useState<Remote<AutoCampaignProductOption>>({
    status: "loading",
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .autoCampaignProducts()
      .then(
        (items) =>
          active &&
          setState({
            status: "ready",
            items: Array.isArray(items) ? items : [],
          }),
      )
      .catch(() => active && setState({ status: "error" }));
    return () => {
      active = false;
    };
  }, [enabled]);
  return state;
}

/** Ativos e, mesmo inativos, os já escolhidos na campanha. */
function activeOrSelected(items: Choice[], selected: string[]) {
  return items
    .filter((item) => item.active || selected.includes(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
