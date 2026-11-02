import {
  patientProfileLabels,
  patientResidenceTypeLabels,
  type PatientInput,
} from "@crm/contracts/patients";
import { useState } from "react";
import { formatCep, lookupCep } from "../../shared/lib/cep";

type PatientProfileInput = Pick<
  PatientInput,
  keyof typeof patientProfileLabels
>;

type PatientResidenceTypeChoice = NonNullable<PatientInput["residenceType"]>;
type ResidenceDetailKey = "buildingName" | "block" | "floor" | "unit";

/** Detalhes pedidos por tipo de residência, na ordem em que aparecem. */
const residenceDetailFields: Partial<
  Record<
    PatientResidenceTypeChoice,
    {
      key: ResidenceDetailKey;
      label: string;
      placeholder: string;
      maxLength: number;
    }[]
  >
> = {
  apartment: [
    {
      key: "buildingName",
      label: "Nome do edifício",
      placeholder: "Ex.: Edifício Solar",
      maxLength: 120,
    },
    {
      key: "block",
      label: "Bloco/torre",
      placeholder: "Ex.: B",
      maxLength: 40,
    },
    { key: "floor", label: "Andar", placeholder: "Ex.: 3", maxLength: 10 },
    {
      key: "unit",
      label: "Número do apartamento",
      placeholder: "Ex.: 302",
      maxLength: 20,
    },
  ],
  condominium: [
    {
      key: "buildingName",
      label: "Nome do condomínio",
      placeholder: "Ex.: Residencial Jardins",
      maxLength: 120,
    },
    {
      key: "block",
      label: "Quadra/bloco",
      placeholder: "Ex.: 4",
      maxLength: 40,
    },
    {
      key: "unit",
      label: "Número da casa/lote",
      placeholder: "Ex.: 12",
      maxLength: 20,
    },
  ],
  commercial: [
    {
      key: "buildingName",
      label: "Edifício/empresa",
      placeholder: "Ex.: Centro Empresarial",
      maxLength: 120,
    },
    { key: "floor", label: "Andar", placeholder: "Ex.: 5", maxLength: 10 },
    { key: "unit", label: "Sala", placeholder: "Ex.: 504", maxLength: 20 },
  ],
};

const allResidenceDetailFields: ResidenceDetailKey[] = [
  "buildingName",
  "block",
  "floor",
  "unit",
];

export function PatientProfileFields({
  form,
  onChange,
  withAddress = true,
}: {
  /** O lead não guarda endereço (U19): só é pedido na conversão. */
  withAddress?: boolean;
  form: PatientProfileInput;
  onChange: <K extends keyof PatientProfileInput>(
    key: K,
    value: PatientProfileInput[K],
  ) => void;
}) {
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
  const residenceType = form.residenceType ?? "";
  const details = residenceDetailFields[residenceType] ?? [];
  function changeResidenceType(next: PatientResidenceTypeChoice) {
    onChange("residenceType", next);
    // Detalhe que o novo tipo não pede sai do cadastro (ex.: andar de quem mudou para casa).
    const kept = (residenceDetailFields[next] ?? []).map(({ key }) => key);
    for (const key of allResidenceDetailFields)
      if (!kept.includes(key) && form[key]) onChange(key, "");
  }
  return (
    <>
      {withAddress && (
        <fieldset className="form-fieldset span-2">
          <legend>Endereço</legend>
          <div className="form-fieldset-grid">
            {/* CEP primeiro: o endereço vem preenchido pelo ViaCEP (U16). */}
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
            <label>
              {patientProfileLabels.residenceType}
              <select
                value={residenceType}
                onChange={(event) =>
                  changeResidenceType(
                    event.target.value as PatientResidenceTypeChoice,
                  )
                }
              >
                <option value="">Não informado</option>
                {Object.entries(patientResidenceTypeLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              {patientProfileLabels.address}
              <input
                autoComplete="address-line1"
                placeholder="Rua, avenida, travessa…"
                maxLength={300}
                value={form.address ?? ""}
                onChange={(event) => onChange("address", event.target.value)}
              />
            </label>
            <label>
              {patientProfileLabels.addressNumber}
              <input
                placeholder="Ex.: 120 ou S/N"
                maxLength={20}
                value={form.addressNumber ?? ""}
                onChange={(event) =>
                  onChange("addressNumber", event.target.value)
                }
              />
            </label>
            {details.map(({ key, label, placeholder, maxLength }) => (
              <label key={key}>
                {label}
                <input
                  placeholder={placeholder}
                  maxLength={maxLength}
                  value={form[key] ?? ""}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </label>
            ))}
            <label>
              {patientProfileLabels.complement}
              <input
                autoComplete="address-line2"
                placeholder="Ex.: fundos, casa 2"
                maxLength={120}
                value={form.complement ?? ""}
                onChange={(event) => onChange("complement", event.target.value)}
              />
            </label>
            <label>
              {patientProfileLabels.referencePoint}
              <input
                placeholder="Ex.: em frente à praça"
                maxLength={200}
                value={form.referencePoint ?? ""}
                onChange={(event) =>
                  onChange("referencePoint", event.target.value)
                }
              />
            </label>
            {(["neighborhood", "city", "state"] as const).map((key) => (
              <label key={key}>
                {patientProfileLabels[key]}
                <input
                  value={form[key] ?? ""}
                  maxLength={key === "state" ? 2 : 100}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="form-fieldset span-2">
        <legend>Informações complementares</legend>
        <div className="form-fieldset-grid">
          {(["occupation", "source"] as const).map((key) => (
            <label key={key}>
              {patientProfileLabels[key]}
              <input
                value={form[key] ?? ""}
                maxLength={120}
                onChange={(event) => onChange(key, event.target.value)}
              />
            </label>
          ))}
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
              onChange={(event) =>
                onChange("imageConsent", event.target.checked)
              }
            />
            Autoriza uso de imagem
          </label>
        </div>
      </fieldset>
    </>
  );
}
