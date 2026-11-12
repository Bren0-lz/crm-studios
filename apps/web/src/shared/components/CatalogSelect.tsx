import type { ClinicCatalogEntry, ClinicCatalogKind } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";

const OTHER = "__other__";

/**
 * Select alimentado por um catálogo de Configurações › Cadastros, com a opção "Outro" (texto
 * livre). Um valor antigo que não está no catálogo continua aparecendo como opção. Com
 * `onCreate`, mostra abaixo do campo o botão `createLabel` (ex.: "Cadastrar origem"); quem
 * cadastra muda `reloadKey` para a lista ser lida de novo.
 */
export function CatalogSelect({
  kind,
  label,
  value,
  onChange,
  required = false,
  maxLength = 80,
  createLabel,
  onCreate,
  reloadKey = 0,
}: {
  kind: ClinicCatalogKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  createLabel?: string | undefined;
  onCreate?: (() => void) | undefined;
  reloadKey?: number;
}) {
  const [items, setItems] = useState<ClinicCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState(false);
  // Item recém-cadastrado vira o valor: sai do texto livre de "Outro".
  const [seenReloadKey, setSeenReloadKey] = useState(reloadKey);
  if (seenReloadKey !== reloadKey) {
    setSeenReloadKey(reloadKey);
    setCustom(false);
  }
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
  }, [kind, reloadKey]);
  const names = (items ?? [])
    .filter((item) => item.active)
    .map((item) => item.name);
  const legacy = value && !custom && !names.includes(value) ? value : "";
  const field = (
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
  );
  return (
    <>
      {onCreate ? (
        <div className="catalog-select-field">
          {field}
          <button type="button" className="text-button" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" />
            {createLabel ?? "Cadastrar"}
          </button>
        </div>
      ) : (
        field
      )}
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
