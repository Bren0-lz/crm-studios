import { type GroupClass, describeGroupSchedule } from "@crm/contracts";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { GroupDetails } from "../../shared/components/GroupDetails";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { groupOperationRange } from "../../shared/lib/formatting";
import { compatiblePlanGroups } from "../../shared/lib/plan-groups";
import { groupVacancyLabel } from "./model";

export function GuidedGroupField({
  serviceIds,
  value,
  onChange,
  groups,
  setGroups,
}: {
  serviceIds: string[];
  value: string;
  onChange: (groupId: string) => void;
  groups: GroupClass[] | null;
  setGroups: Dispatch<SetStateAction<GroupClass[] | null>>;
}) {
  const { can } = useAuthorization();
  const canEnroll = can("groups.enroll");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canEnroll || groups !== null) return;
    let active = true;
    const dates = groupOperationRange();
    api
      .groupWorkspace(dates.from, dates.to)
      .then((data) => {
        if (active) setGroups(data.groups);
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [canEnroll, groups, setGroups, attempt]);
  if (!canEnroll)
    return (
      <div className="field-with-hint span-2">
        <small className="field-hint">
          A turma pode ser escolhida depois com o responsável.
        </small>
      </div>
    );
  const compatible = compatiblePlanGroups(
    groups,
    serviceIds.map((serviceId) => ({ serviceId })),
  );
  // Plano de aulas em grupo (serviço com turma ativa): a turma é obrigatória.
  const required = compatible.length > 0;
  const selected = compatible.find((item) => item.id === value);
  return (
    <div className="field-with-hint span-2">
      {loadError ? (
        <p className="form-error">
          {`Não foi possível carregar as turmas: ${loadError}`}{" "}
          <button
            type="button"
            className="secondary-button button-sm"
            onClick={() => {
              setLoadError("");
              setAttempt((current) => current + 1);
            }}
          >
            Tentar carregar turmas
          </button>
        </p>
      ) : groups === null ? (
        <LoadingBlock />
      ) : (
        <label>
          {required ? "Turma" : "Turma (opcional)"}
          <select
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">
              {required ? "Selecione a turma" : "Escolher depois"}
            </option>
            {compatible.map((item) => (
              <option value={item.id} key={item.id}>
                {`${item.name} — ${describeGroupSchedule(item.weeklySlots ?? [])} · ${item.professionalName} · ${groupVacancyLabel(item)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && <GroupDetails group={selected} />}
      <small className="field-hint">
        {required
          ? "Plano de aulas em grupo: escolha a turma do cliente."
          : "A turma pode ser escolhida depois com o responsável."}
      </small>
    </div>
  );
}
