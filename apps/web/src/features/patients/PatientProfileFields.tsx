import {
  patientProfileLabels,
  type PatientInput,
} from "@crm/contracts/patients";
import { PhoneInput } from "../../shared/components/PhoneInput";
import { useEffect, useState } from "react";
import type { ClinicCatalogEntry } from "@crm/contracts";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { formatCep, lookupCep } from "../../shared/lib/cep";

export function PatientProfileFields({
  form,
  onChange,
}: {
  form: PatientInput;
  onChange: <K extends keyof PatientInput>(
    key: K,
    value: PatientInput[K],
  ) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [catalogs, setCatalogs] = useState<{
    interests: ClinicCatalogEntry[];
    levels: ClinicCatalogEntry[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    Promise.all([api.clinicCatalog("interest"), api.clinicCatalog("level")])
      .then(([interests, levels]) => {
        if (alive) setCatalogs({ interests, levels });
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened]);
  const [cepStatus, setCepStatus] = useState("");
  async function changeCep(value: string) {
    const formatted = formatCep(value);
    onChange("postalCode", formatted);
    if (formatted.replace(/\D/g, "").length !== 8) {
      setCepStatus("");
      return;
    }
    setCepStatus("Buscando endereço…");
    try {
      const found = await lookupCep(formatted);
      if (!found) {
        setCepStatus("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      if (found.address) onChange("address", found.address);
      if (found.neighborhood) onChange("neighborhood", found.neighborhood);
      if (found.city) onChange("city", found.city);
      if (found.state) onChange("state", found.state);
      setCepStatus("Endereço preenchido pelo CEP. Confira o número.");
    } catch {
      setCepStatus("Não foi possível consultar o CEP. Preencha manualmente.");
    }
  }
  // CEP primeiro: o endereço vem preenchido pelo ViaCEP (U16).
  const textFields = [
    "address",
    "neighborhood",
    "city",
    "state",
    "guardianName",
    "occupation",
    "source",
  ] as const;
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Informações complementares</legend>
      <div className="form-fieldset-grid">
        <div className="field-with-hint">
          <label>
            {patientProfileLabels.postalCode}
            <input
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              maxLength={9}
              value={form.postalCode ?? ""}
              onChange={(event) => void changeCep(event.target.value)}
            />
          </label>
          {cepStatus && (
            <small className="field-hint" role="status">
              {cepStatus}
            </small>
          )}
        </div>
        {textFields.map((key) => (
          <label key={key}>
            {patientProfileLabels[key]}
            <input
              value={form[key] ?? ""}
              maxLength={key === "state" ? 2 : 160}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </label>
        ))}
        <label>
          Telefone do responsável
          <PhoneInput
            value={form.guardianPhone ?? ""}
            onChange={(value) => onChange("guardianPhone", value)}
          />
        </label>
        <label>
          Gênero
          <select
            value={form.gender ?? ""}
            onChange={(event) =>
              onChange("gender", event.target.value as PatientInput["gender"])
            }
          >
            <option value="">Não informado</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
            <option value="undisclosed">Prefere não informar</option>
          </select>
        </label>
        <label>
          Tipo de cliente
          <select
            value={form.clientType ?? ""}
            onChange={(event) =>
              onChange(
                "clientType",
                event.target.value as PatientInput["clientType"],
              )
            }
          >
            <option value="">Não informado</option>
            <option value="fixed">Fixo</option>
            <option value="rotating">Rotativo</option>
          </select>
        </label>
        <label>
          Cliente desde
          <input
            type="date"
            value={form.clientSince ?? ""}
            onChange={(event) => onChange("clientSince", event.target.value)}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={form.imageConsent ?? false}
            onChange={(event) => onChange("imageConsent", event.target.checked)}
          />
          Autoriza uso de imagem
        </label>
      </div>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) setOpened(true);
        }}
      >
        <summary>Interesses e nível</summary>
        {error ? (
          <ErrorBanner error={error} />
        ) : !catalogs ? (
          <LoadingBlock />
        ) : (
          <>
            <label>
              Nível
              <select
                value={form.level ?? ""}
                onChange={(event) => onChange("level", event.target.value)}
              >
                <option value="">Não informado</option>
                {catalogs.levels
                  .filter((item) => item.active || item.name === form.level)
                  .map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {catalogs.interests
              .filter(
                (item) => item.active || form.interests?.includes(item.name),
              )
              .map((item) => (
                <label className="checkbox-field" key={item.id}>
                  <input
                    type="checkbox"
                    checked={form.interests?.includes(item.name) ?? false}
                    onChange={(event) =>
                      onChange(
                        "interests",
                        event.target.checked
                          ? [...(form.interests ?? []), item.name]
                          : (form.interests?.filter(
                              (name) => name !== item.name,
                            ) ?? []),
                      )
                    }
                  />
                  {item.name}
                </label>
              ))}
          </>
        )}
      </details>
    </fieldset>
  );
}
