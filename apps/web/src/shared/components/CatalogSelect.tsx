import type { ClinicCatalogEntry, ClinicCatalogKind } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

const OTHER = "__other__";

/**
 * Select alimentado por um catálogo de Configurações › Cadastros, com a opção "Outro" (texto
 * livre). Um valor antigo que não está no catálogo continua aparecendo como opção.
 */
export function CatalogSelect({
  kind,
  label,
  value,
  onChange,
  required = false,
  maxLength = 80,
}: {
  kind: ClinicCatalogKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
}) {
  const [items, setItems] = useState<ClinicCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
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
  const names = (items ?? [])
    .filter((item) => item.active)
    .map((item) => item.name);
  const legacy = value && !custom && !names.includes(value) ? value : "";
  return (
    <>
      <label>
        {label}
        <select
          required={required}
          value={custom ? OTHER : value}
          onChange={(event) => {
            if (event.target.value === OTHER) {
              setCustom(true);
              onChange("");
            } else {
              setCustom(false);
              onChange(event.target.value);
            }
          }}
        >
          <option value="">Selecione</option>
          {legacy && <option value={legacy}>{legacy}</option>}
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={OTHER}>Outro</option>
        </select>
        {error && <small role="status">Catálogo indisponível: {error}</small>}
      </label>
      {custom && (
        <label>
          {label}: qual?
          <input
            autoFocus
            required={required}
            maxLength={maxLength}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
    </>
  );
}
