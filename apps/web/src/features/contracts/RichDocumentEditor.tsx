import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  documentTemplateVariables,
  type DocumentContent,
} from "@crm/contracts";
import { useEffect, useId, useState } from "react";

const DocumentField = Node.create({
  name: "documentField",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    key: {
      default: "paciente_nome",
      parseHTML: (element) => element.getAttribute("data-document-field"),
    },
  }),
  parseHTML: () => [{ tag: "span[data-document-field]" }],
  renderHTML({ node, HTMLAttributes }) {
    const variable = documentTemplateVariables.find(
      (item) => item.key === node.attrs.key,
    );
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-document-field": node.attrs.key,
        class: "document-field",
      }),
      variable?.label ?? "Campo automático",
    ];
  },
});

function editorContent(value: JSONContent): DocumentContent {
  return {
    version: 1,
    doc: JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        item === null ? undefined : item,
      ),
    ) as DocumentContent["doc"],
  };
}

export function RichDocumentEditor({
  value,
  onChange,
  disabled = false,
  fields = true,
}: {
  value: DocumentContent;
  onChange: (content: DocumentContent) => void;
  disabled?: boolean;
  fields?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  function matchesField(label: string, group = "") {
    const normalize = (text: string) =>
      text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("pt-BR");
    return normalize(`${group} ${label}`).includes(normalize(query.trim()));
  }
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        defaultAlignment: "left",
      }),
      DocumentField,
    ],
    content: value.doc as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Conteúdo",
        "aria-multiline": "true",
        class: "document-rich-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: updated, transaction }) => {
      if (transaction.docChanged) onChange(editorContent(updated.getJSON()));
    },
  });
  useEffect(() => {
    if (
      editor &&
      JSON.stringify(editorContent(editor.getJSON()).doc) !==
        JSON.stringify(value.doc)
    )
      editor.commands.setContent(value.doc as JSONContent, {
        emitUpdate: false,
      });
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      underline: current?.isActive("underline"),
      bulletList: current?.isActive("bulletList"),
      orderedList: current?.isActive("orderedList"),
      heading: current?.isActive("heading", { level: 1 })
        ? "1"
        : current?.isActive("heading", { level: 2 })
          ? "2"
          : "0",
    }),
  });
  const groups = [
    { prefix: "paciente_", label: "Cliente" },
    { prefix: "plano_", label: "Plano" },
    { prefix: "profissional_", label: "Profissional" },
    { prefix: "clinica_", label: "Clínica" },
    { prefix: "data_", label: "Data" },
  ];
  return (
    <div className="rich-document-editor">
      <div
        className="document-editor-toolbar"
        role="toolbar"
        aria-label="Formatação do contrato"
      >
        <label htmlFor={`${id}-style`}>Estilo</label>
        <select
          id={`${id}-style`}
          disabled={disabled}
          value={state?.heading ?? "0"}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 0) editor?.chain().focus().setParagraph().run();
            else
              editor
                ?.chain()
                .focus()
                .setHeading({ level: level as 1 | 2 })
                .run();
          }}
        >
          <option value="0">Parágrafo</option>
          <option value="1">Título</option>
          <option value="2">Subtítulo</option>
        </select>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          aria-pressed={Boolean(state?.bold)}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Negrito
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          aria-pressed={Boolean(state?.italic)}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Itálico
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          aria-pressed={Boolean(state?.underline)}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          Sublinhado
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          aria-pressed={Boolean(state?.bulletList)}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          Lista
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          aria-pressed={Boolean(state?.orderedList)}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          Lista numerada
        </button>
        <label htmlFor={`${id}-align`}>Alinhamento</label>
        <select
          id={`${id}-align`}
          disabled={disabled}
          onChange={(event) =>
            editor?.chain().focus().setTextAlign(event.target.value).run()
          }
          value={
            editor?.getAttributes("paragraph").textAlign ??
            editor?.getAttributes("heading").textAlign ??
            "left"
          }
        >
          <option value="left">À esquerda</option>
          <option value="center">Centralizado</option>
          <option value="right">À direita</option>
          <option value="justify">Justificado</option>
        </select>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          Desfazer
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          Refazer
        </button>
        <button
          className="secondary-button button-sm"
          type="button"
          disabled={disabled}
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .unsetAllMarks()
              .clearNodes()
              .unsetTextAlign()
              .run()
          }
        >
          Limpar formatação
        </button>
      </div>
      {fields && (
        <details className="document-field-menu">
          <summary>Inserir campo automático</summary>
          <p className="field-hint">
            Escolha um dado. Ele será preenchido para cada cliente ao preparar o
            contrato.
          </p>
          <label htmlFor={`${id}-search`}>Buscar campo</label>
          <input
            id={`${id}-search`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: nome, valor, endereço"
          />
          <div
            className="template-fields"
            role="group"
            aria-label="Inserir campo"
          >
            {groups.map((group) => {
              const variables = documentTemplateVariables.filter(
                (variable) =>
                  variable.key.startsWith(group.prefix) &&
                  matchesField(variable.label, group.label),
              );
              return variables.length ? (
                <div className="template-field-group" key={group.prefix}>
                  <span>{group.label}</span>
                  {variables.map((variable) => (
                    <button
                      key={variable.key}
                      className="secondary-button button-sm"
                      type="button"
                      disabled={disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        editor
                          ?.chain()
                          .focus()
                          .insertContent({
                            type: "documentField",
                            attrs: { key: variable.key },
                          })
                          .run()
                      }
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
              ) : null;
            })}
            {!documentTemplateVariables.some((variable) =>
              matchesField(variable.label),
            ) && <p className="field-hint">Nenhum campo encontrado.</p>}
          </div>
        </details>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
