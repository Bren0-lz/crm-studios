import {
  documentTemplateVariables,
  formatPhone,
  missingDocumentValue,
  previewDocumentTemplate,
  type ClinicBranding,
  type DocumentTemplateValues,
} from "@crm/contracts";
import { Maximize2, Minimize2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { DocumentPaper } from "./DocumentPaper";

/** Botões "Inserir campo" agrupados pelo cadastro de onde o dado vem. */
const variableGroups = [
  { prefix: "paciente_", label: "Cliente" },
  { prefix: "plano_", label: "Plano" },
  { prefix: "profissional_", label: "Profissional" },
  { prefix: "clinica_", label: "Clínica" },
  { prefix: "data_", label: "Data" },
].map((group) => ({
  ...group,
  variables: documentTemplateVariables.filter((variable) =>
    variable.key.startsWith(group.prefix),
  ),
}));

/** Campos da clínica que vêm de Configurações (e não do exemplo) na prévia. */
const clinicFields = {
  clinica_nome: "name",
  clinica_razao_social: "legalName",
  clinica_cnpj: "taxId",
  clinica_endereco: "address",
  clinica_telefone: "phone",
  clinica_email: "email",
} as const satisfies Partial<
  Record<keyof DocumentTemplateValues, keyof ClinicBranding>
>;

function clinicValue(
  branding: ClinicBranding | null | undefined,
  field: keyof ClinicBranding,
) {
  const value = branding?.[field];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Conteúdo do modelo com botões "Inserir campo" (inserem `{{variavel}}` na posição do cursor)
 * e a prévia do documento final numa folha, com os dados da clínica e um cliente de exemplo.
 * `studio` deixa o editor e a folha lado a lado ocupando a largura toda, com opção de ampliar
 * só a folha.
 */
export function TemplateBodyEditor({
  value,
  onChange,
  rows = 8,
  disabled = false,
  branding,
  studio = false,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  branding?: ClinicBranding | null | undefined;
  studio?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [previewOnly, setPreviewOnly] = useState(false);

  function insert(key: string) {
    const textarea = textareaRef.current;
    const token = `{{${key}}}`;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  // Com os dados da clínica carregados, a prévia mostra o que a emissão vai mostrar,
  // inclusive "não informado" no que falta no cadastro.
  const clinicLoaded = Boolean(clinicValue(branding, "name"));
  const overrides: Partial<DocumentTemplateValues> = {};
  const missingClinicFields: string[] = [];
  if (clinicLoaded) {
    for (const variable of documentTemplateVariables) {
      if (!(variable.key in clinicFields)) continue;
      const key = variable.key as keyof typeof clinicFields;
      const filled = clinicValue(branding, clinicFields[key]);
      if (key === "clinica_razao_social") {
        // Razão social em branco cai no nome da clínica, como na emissão.
        overrides[key] = filled || clinicValue(branding, "name");
        continue;
      }
      overrides[key] = filled
        ? key === "clinica_telefone"
          ? formatPhone(filled)
          : filled
        : missingDocumentValue;
      if (!filled && value.includes(`{{${key}}}`))
        missingClinicFields.push(variable.label);
    }
  }

  const preview = (
    <section
      className="template-preview"
      aria-labelledby={`${id}-preview`}
      aria-describedby={
        missingClinicFields.length > 0 ? `${id}-missing` : undefined
      }
    >
      <div className="template-preview-head">
        <h3 id={`${id}-preview`}>Prévia do documento final</h3>
        {studio && (
          <button
            type="button"
            className="secondary-button button-sm"
            aria-pressed={previewOnly}
            onClick={() => setPreviewOnly((current) => !current)}
          >
            {previewOnly ? (
              <Minimize2 size={15} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} aria-hidden="true" />
            )}
            {previewOnly ? "Mostrar editor" : "Ampliar prévia"}
          </button>
        )}
      </div>
      <p className="template-preview-copy">
        Dados da clínica do cadastro e um cliente de exemplo.
      </p>
      {missingClinicFields.length > 0 && (
        <p className="field-hint" id={`${id}-missing`}>
          Sem cadastro em Configurações › Clínica:{" "}
          {missingClinicFields.join(", ")}. Na emissão, aparece “não informado”.
        </p>
      )}
      <div className="document-paper-canvas">
        <DocumentPaper
          body={previewDocumentTemplate(value, overrides)}
          branding={branding}
        />
      </div>
    </section>
  );

  return (
    <div
      className={[
        "template-body-editor",
        studio ? "template-studio" : "",
        previewOnly ? "preview-only" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="template-body-input" hidden={previewOnly}>
        <label htmlFor={`${id}-body`}>Conteúdo</label>
        <div
          className="template-fields"
          role="group"
          aria-label="Inserir campo"
        >
          <span>Inserir campo:</span>
          {variableGroups.map((group) => (
            <div className="template-field-group" key={group.prefix}>
              <span>{group.label}</span>
              {group.variables.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  className="secondary-button button-sm"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insert(variable.key)}
                >
                  {variable.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <textarea
          id={`${id}-body`}
          ref={textareaRef}
          required
          rows={rows}
          disabled={disabled}
          spellCheck
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {preview}
    </div>
  );
}
