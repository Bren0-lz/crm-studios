import { useEffect, useState } from "react";
import type {
  AdminUser,
  AdminUserAgendaInput,
  Professional,
  ProfessionalInput,
} from "@crm/contracts";
import { api } from "../../api";

const emptyProfessional: ProfessionalInput = {
  fullName: "",
  crefito: "",
  specialty: "Fisioterapia",
  color: "#547A6B",
};
function fields(professional: ProfessionalInput): ProfessionalInput {
  return {
    fullName: professional.fullName,
    crefito: professional.crefito,
    specialty: professional.specialty,
    color: professional.color,
  };
}

export function useUserAgenda(
  user: AdminUser | null,
  users: AdminUser[],
  fullName: string,
) {
  const current = user?.professional;
  const [attends, setAttends] = useState(current?.active ?? false);
  const [mode, setMode] = useState<"create" | "existing">(
    current ? "existing" : "create",
  );
  const [selected, setSelected] = useState(current?.id ?? "");
  const [draft, setDraft] = useState<ProfessionalInput>(() =>
    current ? fields(current) : emptyProfessional,
  );
  const [professionals, setProfessionals] = useState<Professional[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .professionals()
      .then((items) => {
        if (active) {
          setProfessionals(items);
          setError("");
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const taken = new Set(
    users
      .filter((item) => item.id !== user?.id)
      .map((item) => item.professionalId),
  );
  const options = (professionals ?? []).filter(
    (item) => item.active && !taken.has(item.id),
  );
  if (current && !options.some((item) => item.id === current.id))
    options.unshift(current);
  function toggle(value: boolean) {
    setAttends(value);
    if (value && !draft.fullName)
      setDraft((previous) => ({ ...previous, fullName }));
  }
  function changeMode(value: "create" | "existing") {
    setMode(value);
    setSelected("");
    setDraft({ ...emptyProfessional, fullName });
  }
  function select(id: string) {
    setSelected(id);
    const professional = options.find((item) => item.id === id);
    if (professional) setDraft(fields(professional));
  }
  const missing = attends
    ? [
        ...(mode === "existing" && !selected ? ["Profissional da agenda"] : []),
        ...(draft.fullName.trim().length < 3
          ? ["Nome na agenda (pelo menos 3 caracteres)"]
          : []),
        ...(draft.crefito.trim().length < 4
          ? ["Registro profissional (pelo menos 4 caracteres)"]
          : []),
        ...(draft.specialty.trim().length < 2
          ? ["Especialidade (pelo menos 2 caracteres)"]
          : []),
      ]
    : [];
  const data = {
    ...draft,
    fullName: draft.fullName.trim(),
    crefito: draft.crefito.trim(),
    specialty: draft.specialty.trim(),
  };
  let operation: AdminUserAgendaInput | undefined;
  if (!attends) {
    if (current?.active) operation = { mode: "deactivate" };
  } else if (mode === "create") operation = { mode: "create", data };
  else if (
    selected &&
    !(
      current?.active &&
      selected === current.id &&
      JSON.stringify(data) === JSON.stringify(fields(current))
    )
  )
    operation = { mode: "save", id: selected, data };
  return {
    hasProfessional: Boolean(current),
    attends,
    mode,
    selected,
    draft,
    setDraft,
    toggle,
    changeMode,
    select,
    options,
    error,
    loading: professionals === null && !error,
    retry: () => {
      setError("");
      setAttempt((value) => value + 1);
    },
    missing,
    operation,
  };
}
