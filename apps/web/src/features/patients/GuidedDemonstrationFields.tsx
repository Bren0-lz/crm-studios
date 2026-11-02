import {
  leadAppointmentNotesMaxLength,
  type Professional,
  type Room,
  type Service,
} from "@crm/contracts";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import type { GuidedDemonstrationForm } from "./types";

export function GuidedDemonstrationFields({
  value,
  setValue,
}: {
  value: GuidedDemonstrationForm;
  setValue: Dispatch<SetStateAction<GuidedDemonstrationForm>>;
}) {
  const [options, setOptions] = useState<{
    services: Service[];
    professionals: Professional[];
    rooms: Room[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api.services(), api.professionals(), api.rooms()])
      .then(([services, professionals, rooms]) => {
        if (!active) return;
        setOptions({ services, professionals, rooms });
        setValue((current) => ({
          ...current,
          serviceId: current.serviceId || (services[0]?.id ?? ""),
          professionalId:
            current.professionalId || (professionals[0]?.id ?? ""),
          roomId: current.roomId || (rooms[0]?.id ?? ""),
        }));
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [setValue]);
  if (loadError)
    return (
      <p className="form-error">{`Não foi possível carregar a agenda: ${loadError}`}</p>
    );
  if (options === null) return <LoadingBlock />;
  if (
    options.services.length === 0 ||
    options.professionals.length === 0 ||
    options.rooms.length === 0
  )
    return (
      <p className="muted-copy">
        Cadastre serviço, profissional e sala antes de agendar a aula
        experimental.
      </p>
    );
  return (
    <div className="form-grid">
      <label>
        Serviço
        <select
          required
          value={value.serviceId}
          onChange={(e) => setValue({ ...value, serviceId: e.target.value })}
        >
          {options.services.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Profissional
        <select
          required
          value={value.professionalId}
          onChange={(e) =>
            setValue({ ...value, professionalId: e.target.value })
          }
        >
          {options.professionals.map((item) => (
            <option value={item.id} key={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sala
        <select
          required
          value={value.roomId}
          onChange={(e) => setValue({ ...value, roomId: e.target.value })}
        >
          {options.rooms.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Data e horário
        <input
          required
          type="datetime-local"
          value={value.startsAt}
          onChange={(e) => setValue({ ...value, startsAt: e.target.value })}
        />
      </label>
      <label className="span-2">
        Observação
        <textarea
          rows={2}
          maxLength={leadAppointmentNotesMaxLength}
          value={value.notes}
          onChange={(e) => setValue({ ...value, notes: e.target.value })}
        />
      </label>
    </div>
  );
}
