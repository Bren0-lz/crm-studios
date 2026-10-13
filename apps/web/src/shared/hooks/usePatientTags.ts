import type { PatientTag } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

export function usePatientTags(enabled = true) {
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
  return { tags, error };
}
