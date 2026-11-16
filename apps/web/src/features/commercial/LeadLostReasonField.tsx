import type { ClinicCatalogEntry } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";

const OTHER = "__other__";
const MAX_LENGTH = 500;

/**
 * Motivo da perda de um lead: seletor com os motivos ativos de Configurações › Cadastros e
 * "Outro motivo", que abre o texto livre. Sem motivos cadastrados (ou com o cadastro
 * indisponível), pede só o texto. O valor devolvido é sempre o texto do motivo.
 */
export function LeadLostReasonField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [items, setItems] = useState<ClinicCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .clinicCatalog("lead_lost_reason")
      .then((data) => {
        if (alive) setItems(data);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!items && !error) return <LoadingBlock />;
  const names = (items ?? [])
    .filter((item) => item.active)
    .map((item) => item.name);
  const freeText = (label: string) => (
    <label>
      {label}
      <input
        autoFocus
        required
        maxLength={MAX_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <small role="status">Motivos cadastrados indisponíveis: {error}</small>
      )}
    </label>
  );
  if (!names.length) return freeText("Motivo da perda");
  return (
    <>
      <label>
        Motivo da perda
        <select
          autoFocus
          required
          value={choice}
          onChange={(event) => {
            const next = event.target.value;
            setChoice(next);
            onChange(next === OTHER ? "" : next);
          }}
        >
          <option value="">Selecione</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={OTHER}>Outro motivo</option>
        </select>
      </label>
      {choice === OTHER && freeText("Descreva o motivo")}
    </>
  );
}
