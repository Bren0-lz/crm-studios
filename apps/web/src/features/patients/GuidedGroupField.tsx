import { type GroupClass, describeGroupSchedule } from "@crm/contracts";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { GroupDetails } from "../../shared/components/GroupDetails";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { groupOperationRange } from "../../shared/lib/formatting";
import { compatiblePlanGroups } from "../../shared/lib/plan-groups";
import { groupVacancyLabel } from "./model";
import { ActionModal } from "../../shared/components/ActionModal";
import { createPortal } from "react-dom";

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
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
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
            onChange={(event) => {
              const group = compatible.find(
                (item) => item.id === event.target.value,
              );
              if (group && group.activeEnrollments >= group.capacity)
                setPendingGroup(group.id);
              else onChange(event.target.value);
            }}
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
      {pendingGroup &&
        createPortal(
          <ActionModal
            eyebrow="Lista de espera"
            title="Turma cheia"
            subtitle="Deseja colocar o cliente na lista de espera desta turma?"
            confirmLabel="Sim, colocar na lista de espera"
            effect="A inclusão será feita ao concluir o cadastro. Quando surgir uma vaga, a equipe será avisada para entrar em contato."
            onClose={() => setPendingGroup(null)}
            onConfirm={async () => {
              onChange(pendingGroup);
              setPendingGroup(null);
            }}
          />,
          document.body,
        )}
      <small className="field-hint">
        {required
          ? "Plano de aulas em grupo: escolha a turma do cliente."
          : "A turma pode ser escolhida depois com o responsável."}
      </small>
    </div>
  );
}
