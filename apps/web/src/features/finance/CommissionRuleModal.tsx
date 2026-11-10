import {
  type Professional,
  type AdminUser,
  type CommissionRuleInput,
  type AdminUserCommissionInput,
  type CommissionRecalculationPreview,
  saoPauloToday,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { CommissionRecalculationNotice } from "./CommissionRecalculationNotice";
/** `recalculationDigest`: prévia confirmada do recálculo das comissões já lançadas. */
export type CommissionRuleDraft = (
  CommissionRuleInput | (AdminUserCommissionInput & { userId: string })
) & { recalculationDigest?: string };
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
    [users, setUsers] = useState<AdminUser[]>([]),
    [error, setError] = useState("");
  const [percentage, setPercentage] = useState("30"),
    [effectiveFrom, setEffectiveFrom] = useState(saoPauloToday()),
    [effectiveUntil, setEffectiveUntil] = useState(""),
    // Prévia do recálculo e a regra que ela descreve (mudar um campo pede outra prévia).
    [preview, setPreview] = useState<{
      key: string;
      data: CommissionRecalculationPreview;
    } | null>(null);
  const dirty = useFormDirty({
    professionalId,
    userId,
    origin,
    percentage,
    effectiveFrom,
    effectiveUntil,
  });
  useEffect(() => {
    if (user?.role !== "admin") return;
    let alive = true;
    api
      .adminUsers()
      .then((userData) => {
        if (alive) setUsers(userData);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [user?.role]);
  const value = Number(percentage.replace(",", "."));
  const terms: AdminUserCommissionInput = {
    percentage: value,
    effectiveFrom,
    ...(effectiveUntil ? { effectiveUntil } : {}),
  };
  const owner = origin === "user" ? { userId } : { professionalId };
  const key = JSON.stringify({ owner, terms });
  const confirmed = preview?.key === key ? preview.data : null;
  // Regra que começa no passado: mostra antes o que muda nas comissões já lançadas.
  async function save() {
    let digest = confirmed?.digest;
    if (!confirmed && effectiveFrom <= saoPauloToday()) {
      const data = await api.commissionRecalculationPreview({
        ...owner,
        rules: [terms],
      });
      if (data.items.length) {
        setPreview({ key, data });
        return;
      }
      digest = data.digest;
    }
    try {
      await onConfirm({
        ...terms,
        ...owner,
        ...(digest ? { recalculationDigest: digest } : {}),
      } as CommissionRuleDraft);
    } catch (cause) {
      // Prévia recusada (comissões mudaram): o próximo Salvar pede outra.
      setPreview(null);
      throw cause;
    }
  }
  return (
    <ActionModal
      eyebrow="Comissões"
      title="Nova regra de comissão"
      subtitle="Percentual sobre o valor pago pelo cliente"
      effect="A comissão é um percentual do valor que o cliente pagou pelo atendimento (comanda ou sessão do plano, já com desconto); atendimento sem cobrança não gera comissão. A regra do usuário prevalece sobre a do profissional. Com início no passado, as comissões já lançadas a partir dessa data são recalculadas: as em aberto mudam de valor e as já pagas ganham um ajuste no próximo pagamento."
      confirmLabel={confirmed ? "Confirmar e recalcular" : "Salvar"}
      missing={[
        ...((origin === "user" ? userId : professionalId)
          ? []
          : [origin === "user" ? "Usuário" : "Profissional"]),
        ...(percentage.trim() === "" ? ["Percentual (%)"] : []),
        ...(effectiveFrom ? [] : ["Vale a partir de"]),
      ]}
      // Regras, não faltas: percentual fora de 0–100 e vigência invertida.
      validate={() => {
        if (!Number.isFinite(value) || value < 0 || value > 100)
          return "Informe um percentual entre 0 e 100.";
        if (effectiveUntil && effectiveUntil < effectiveFrom)
          return "Revise a vigência da regra.";
        return "";
      }}
      dirty={dirty}
      onClose={onClose}
      onConfirm={save}
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
      {confirmed && <CommissionRecalculationNotice preview={confirmed} />}
    </ActionModal>
  );
}
