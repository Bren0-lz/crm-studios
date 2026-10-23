import {
  documentTemplateVariables,
  formatPhone,
  missingDocumentValue,
  documentContentFromText,
  fillDocumentContent,
  documentContentText,
  type DocumentContent,
  type ClinicBranding,
  type DocumentTemplateValues,
} from "@crm/contracts";
import { Maximize2, Minimize2 } from "lucide-react";
import { useId, useState } from "react";
import { DocumentPaper } from "./DocumentPaper";
import { RichDocumentEditor } from "./RichDocumentEditor";

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
  content,
  disabled = false,
  branding,
  studio = false,
}: {
  value: string;
  onChange: (value: string, content: DocumentContent) => void;
  content?: DocumentContent | undefined;
  rows?: number;
  disabled?: boolean;
  branding?: ClinicBranding | null | undefined;
  studio?: boolean;
}) {
  const id = useId();
  const [previewOnly, setPreviewOnly] = useState(false);

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

  const source = content ?? documentContentFromText(value);
  const exampleValues = Object.fromEntries(
    documentTemplateVariables.map((variable) => [
      variable.key,
      variable.example,
    ]),
  );
  const previewContent = fillDocumentContent(source, {
    ...exampleValues,
    ...overrides,
  });
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
          body={documentContentText(previewContent)}
          content={previewContent}
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
        <RichDocumentEditor
          value={source}
          disabled={disabled}
          onChange={(next) => onChange(documentContentText(next), next)}
        />
      </div>
      {preview}
    </div>
  );
}
