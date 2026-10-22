import type {
  Patient,
  PatientProfileFilter,
  PatientSegmentSummary,
} from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
export function PatientProfileFilters({
  patients,
  value,
  onChange,
  onSegments,
}: {
  patients: Patient[];
  value: PatientProfileFilter;
  onChange: (value: PatientProfileFilter) => void;
  onSegments: (items: PatientSegmentSummary[]) => void;
}) {
  const { can } = useAuthorization();
  const [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      onSegments(await api.patientSegments());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="filter-group"
      onToggle={(event) => {
        if (event.currentTarget.open && !opened) {
          setOpened(true);
          void load();
        }
      }}
    >
      <summary>Dados cadastrais e segmentos</summary>
      <div className="form-grid">
        {(
          [
            ["city", "Cidade"],
            ["neighborhood", "Bairro"],
            ["occupation", "Profissão"],
            ["source", "Origem"],
            ["level", "Nível"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <select
              value={value[key] ?? ""}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value || undefined })
              }
            >
              <option value="">Todos</option>
              {[...new Set(patients.map((item) => item[key]).filter(Boolean))]
                .sort()
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <label>
          Interesse
          <select
            value={value.interest ?? ""}
            onChange={(event) =>
              onChange({ ...value, interest: event.target.value || undefined })
            }
          >
            <option value="">Todos</option>
            {[...new Set(patients.flatMap((item) => item.interests ?? []))]
              .sort()
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Gênero
          <select
            value={value.gender ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                gender: (event.target.value ||
                  undefined) as PatientProfileFilter["gender"],
              })
            }
          >
            <option value="">Todos</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
            <option value="undisclosed">Prefere não informar</option>
          </select>
        </label>
        <label>
          Segmento operacional
          <select
            disabled={busy || Boolean(error)}
            value={value.segment ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                segment: (event.target.value ||
                  undefined) as PatientProfileFilter["segment"],
              })
            }
          >
            <option value="">Todos</option>
            <option value="active_plan">Com plano vigente</option>
            <option value="no_plan">Sem plano vigente</option>
            <option value="renewal">Renovação em até 30 dias</option>
            <option value="replacement">Com reposição disponível</option>
            <option value="waiting">Em lista de espera</option>
            {can("finance.view") && (
              <>
                <option value="pending">Com contas pendentes</option>
                <option value="overdue">Com contas atrasadas</option>
              </>
            )}
          </select>
        </label>
        {error && (
          <>
            <ErrorBanner error={error} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void load()}
            >
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </details>
  );
}
