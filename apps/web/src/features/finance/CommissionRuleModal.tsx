import {
  type Professional,
  type Service,
  type AdminUser,
  type CommissionRuleInput,
  type AdminUserCommissionInput,
  saoPauloToday,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
export type CommissionRuleDraft =
  CommissionRuleInput | (AdminUserCommissionInput & { userId: string });
export function CommissionRuleModal({
  professionals,
  onClose,
  onConfirm,
}: {
  professionals: Professional[];
  onClose: () => void;
  onConfirm: (input: CommissionRuleDraft) => Promise<void>;
}) {
  const { user } = useAuthorization();
  const [professionalId, setProfessionalId] = useState(
      professionals[0]?.id ?? "",
    ),
    [userId, setUserId] = useState(""),
    [origin, setOrigin] = useState("professional"),
    [services, setServices] = useState<Service[]>([]),
    [users, setUsers] = useState<AdminUser[]>([]),
    [error, setError] = useState("");
  const [percentage, setPercentage] = useState("30"),
    [fixed, setFixed] = useState(0),
    [kind, setKind] = useState<"percentage" | "fixed">("percentage"),
    [serviceId, setServiceId] = useState(""),
    [effectiveFrom, setEffectiveFrom] = useState(saoPauloToday()),
    [effectiveUntil, setEffectiveUntil] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all([
      api.services(),
      user?.role === "admin" ? api.adminUsers() : Promise.resolve([]),
    ])
      .then(([serviceData, userData]) => {
        if (alive) {
          setServices(serviceData);
          setUsers(userData);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.role]);
  const value = Number(percentage.replace(",", "."));
  return (
    <ActionModal
      eyebrow="Comissões"
      title="Nova regra de comissão"
      subtitle="Regra geral ou específica de serviço"
      effect="A regra do usuário prevalece sobre a do profissional. Em cada origem, a regra do serviço prevalece sobre a geral. Os lançamentos preservam a regra utilizada."
      confirmLabel="Salvar"
      validate={() => {
        if (origin === "user" ? !userId : !professionalId)
          return "Selecione o responsável pela regra.";
        if (
          kind === "percentage" &&
          (percentage.trim() === "" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100)
        )
          return "Informe um percentual entre 0 e 100.";
        if (
          !effectiveFrom ||
          (effectiveUntil && effectiveUntil < effectiveFrom)
        )
          return "Revise a vigência da regra.";
        return "";
      }}
      onClose={onClose}
      onConfirm={() => {
        const terms = {
          ...(kind === "fixed" ? { kind } : {}),
          percentage: kind === "fixed" ? 0 : value,
          ...(kind === "fixed" ? { fixedAmountInCents: fixed } : {}),
          ...(serviceId ? { serviceId } : {}),
          effectiveFrom,
          ...(effectiveUntil ? { effectiveUntil } : {}),
        };
        return onConfirm(
          origin === "user"
            ? { ...terms, userId }
            : { ...terms, professionalId },
        );
      }}
    >
      {error && <ErrorBanner error={error} />}
      {user?.role === "admin" && (
        <label>
          Origem da regra
          <select
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          >
            <option value="professional">Profissional</option>
            <option value="user">Usuário</option>
          </select>
        </label>
      )}
      {origin === "user" ? (
        <label>
          Usuário
          <select
            required
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Selecione</option>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Profissional
          <select
            required
            autoFocus
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
          >
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Serviço
        <select
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">Todos os serviços</option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tipo de comissão
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          <option value="percentage">Percentual sobre o preço da tabela</option>
          <option value="fixed">Valor fixo por presença</option>
        </select>
      </label>
      {kind === "fixed" ? (
        <CurrencyField label="Valor fixo" value={fixed} onChange={setFixed} />
      ) : (
        <label>
          Percentual (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
          />
        </label>
      )}
      <label>
        Vale a partir de
        <input
          type="date"
          required
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
      </label>
      <label>
        Vale até
        <input
          type="date"
          min={effectiveFrom}
          value={effectiveUntil}
          onChange={(event) => setEffectiveUntil(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
