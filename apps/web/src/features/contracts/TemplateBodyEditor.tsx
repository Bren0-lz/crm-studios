import {
  documentTemplateVariables,
  previewDocumentTemplate,
} from "@crm/contracts";
import { useId, useRef } from "react";

/**
 * Conteúdo do modelo com botões "Inserir campo" (inserem `{{variavel}}` na posição do cursor)
 * e a prévia com um cliente de exemplo.
 */
export function TemplateBodyEditor({
  value,
  onChange,
  rows = 8,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

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

  return (
    <div className="template-body-editor">
      <div className="template-body-input">
        <label htmlFor={`${id}-body`}>Conteúdo</label>
        <div
          className="template-fields"
          role="group"
          aria-label="Inserir campo"
        >
          <span>Inserir campo:</span>
          {documentTemplateVariables.map((variable) => (
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
        <textarea
          id={`${id}-body`}
          ref={textareaRef}
          required
          rows={rows}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <section className="template-preview" aria-labelledby={`${id}-preview`}>
        <h3 id={`${id}-preview`}>Prévia com cliente de exemplo</h3>
        <p>
          {previewDocumentTemplate(value) || "O texto do modelo aparece aqui."}
        </p>
      </section>
    </div>
  );
}
