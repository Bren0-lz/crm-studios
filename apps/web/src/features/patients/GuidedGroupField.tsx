import { type GroupClass, describeGroupSchedule } from "@crm/contracts";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { GroupDetails } from "../../shared/components/GroupDetails";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { groupOperationRange } from "../../shared/lib/formatting";
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
  }, [canEnroll, groups, setGroups]);
  const hint = (
    <small className="field-hint">
      A turma pode ser escolhida depois com o responsável.
    </small>
  );
  if (!canEnroll) return <div className="field-with-hint span-2">{hint}</div>;
  const compatible = (groups ?? []).filter(
    (item) => item.active && serviceIds.includes(item.serviceId),
  );
  const selected = compatible.find((item) => item.id === value);
  return (
    <div className="field-with-hint span-2">
      {loadError ? (
        <p className="form-error">{`Não foi possível carregar as turmas: ${loadError}`}</p>
      ) : groups === null ? (
        <LoadingBlock />
      ) : (
        <label>
          Turma (opcional)
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Escolher depois</option>
            {compatible.map((item) => (
              <option value={item.id} key={item.id}>
                {`${item.name} — ${describeGroupSchedule(item.weeklySlots ?? [])} · ${item.professionalName} · ${groupVacancyLabel(item)}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && <GroupDetails group={selected} />}
      {hint}
    </div>
  );
}
