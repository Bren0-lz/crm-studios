import type { AutomaticPatientTag, PatientTag } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

/** Só aproveita etiquetas automáticas no formato esperado (chave, nomes e cor em texto). */
export function validAutomaticTags(data: unknown): AutomaticPatientTag[] {
  return Array.isArray(data)
    ? (data as AutomaticPatientTag[]).filter(
        (tag) =>
          typeof tag?.key === "string" &&
          typeof tag.defaultName === "string" &&
          typeof tag.name === "string" &&
          typeof tag.color === "string",
      )
    : [];
}

/**
 * Nome e cor que a clínica deu às etiquetas automáticas (AT1). Sem a leitura (desligada ou com
 * falha), fica `[]` e elas aparecem com o nome e a cor padrão.
 */
export function useAutomaticPatientTags(enabled = true) {
  const [automatic, setAutomatic] = useState<AutomaticPatientTag[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .automaticPatientTags()
      .then((data) => active && setAutomatic(validAutomaticTags(data)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return automatic;
}

/**
 * Etiquetas configuradas e, com `withAutomatic`, o nome/cor das automáticas (AT1) para telas
 * que mostram etiquetas de clientes.
 */
export function usePatientTags(enabled = true, withAutomatic = false) {
  const [tags, setTags] = useState<PatientTag[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api
      .patientTags()
      .then((data) => {
        // Só aproveita itens no formato de etiqueta (nome em texto).
        if (active)
          setTags(
            Array.isArray(data)
              ? data.filter((tag) => typeof tag?.name === "string")
              : [],
          );
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  const automatic = useAutomaticPatientTags(enabled && withAutomatic);
  return { tags, automatic, error };
}
