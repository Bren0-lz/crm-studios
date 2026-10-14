import type { ClinicCatalogEntry, ClinicCatalogKind } from "@crm/contracts";
import { useEffect, useId, useState } from "react";
import { api } from "../../api";
export function CatalogInput({
  kind,
  label,
  value,
  onChange,
  required = false,
  maxLength = 80,
  autoFocus = false,
}: {
  kind: ClinicCatalogKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const id = useId(),
    [items, setItems] = useState<ClinicCatalogEntry[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .clinicCatalog(kind)
      .then((data) => {
        if (alive) setItems(data);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [kind]);
  return (
    <label>
      {label}
      <input
        autoFocus={autoFocus}
        list={id}
        required={required}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={id}>
        {items
          .filter((item) => item.active)
          .map((item) => (
            <option key={item.id} value={item.name} />
          ))}
      </datalist>
      {error && <small role="status">Sugestões indisponíveis: {error}</small>}
    </label>
  );
}
