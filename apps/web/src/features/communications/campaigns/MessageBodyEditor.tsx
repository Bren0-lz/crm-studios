import {
  Extension,
  Node,
  mergeAttributes,
  nodeInputRule,
  nodePasteRule,
  type JSONContent,
} from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { messageVariables } from "@crm/contracts";
import { Bold, Italic, Strikethrough, UserRound } from "lucide-react";
import { useEffect } from "react";

const variablePattern = new RegExp(
  messageVariables
    .map((variable) => variable.code)
    .sort((a, b) => b.length - a.length)
    .map((code) => code.replace(/[{}]/g, "\\$&"))
    .join("|"),
  "g",
);

function variableLabel(code: string) {
  return (
    messageVariables.find((variable) => variable.code === code)?.label ?? code
  );
}

/** Código como `{{nome}}` mostrado como etiqueta verde, igual aos campos do contrato. */
const MessageVariable = Node.create({
  name: "messageVariable",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    code: {
      default: messageVariables[0].code,
      parseHTML: (element) => element.getAttribute("data-message-variable"),
    },
  }),
  parseHTML: () => [{ tag: "span[data-message-variable]" }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-message-variable": node.attrs.code,
        class: "document-field",
        title: node.attrs.code,
      }),
      variableLabel(String(node.attrs.code)),
    ];
  },
  renderText: ({ node }) => String(node.attrs.code),
  addInputRules() {
    return [
      nodeInputRule({
        find: new RegExp(`(?:${variablePattern.source})$`),
        type: this.type,
        getAttributes: (match) => ({ code: match[0] }),
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: variablePattern,
        type: this.type,
        getAttributes: (match) => ({ code: match[0] }),
      }),
    ];
  },
});

/** Texto da mensagem: um parágrafo por linha, com os códigos no lugar das etiquetas. */
function messageText(doc: ProseMirrorNode) {
  const lines: string[] = [];
  doc.forEach((paragraph) => {
    let line = "";
    paragraph.forEach((child) => {
      if (child.isText) line += child.text ?? "";
      else if (child.type.name === "hardBreak") line += "\n";
      else if (child.type.name === "messageVariable")
        line += String(child.attrs.code);
    });
    lines.push(line);
  });
  return lines.join("\n");
}

function messageDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: text.split("\n").map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      for (const match of line.matchAll(variablePattern)) {
        if (match.index > last)
          content.push({ type: "text", text: line.slice(last, match.index) });
        content.push({ type: "messageVariable", attrs: { code: match[0] } });
        last = match.index + match[0].length;
      }
      if (last < line.length)
        content.push({ type: "text", text: line.slice(last) });
      return content.length
        ? { type: "paragraph", content }
        : { type: "paragraph" };
    }),
  };
}

/** Recusa edições que passem do limite de caracteres (não bloqueia apagar). */
function maxLengthExtension(maxLength: number) {
  return Extension.create({
    name: "messageMaxLength",
    addProseMirrorPlugins: () => [
      new Plugin({
        filterTransaction: (transaction) => {
          if (!transaction.docChanged) return true;
          const next = messageText(transaction.doc).length;
          return (
            next <= maxLength || next <= messageText(transaction.before).length
          );
        },
      }),
    ],
  });
}

/**
 * Campo da mensagem do WhatsApp: botões que inserem os códigos (mostrados como etiquetas
 * verdes), atalhos de formatação com os marcadores do WhatsApp e o texto com até `maxLength`
 * caracteres. `value` e `onChange` usam o texto puro, com `{{nome}}` etc.
 */
export function MessageBodyEditor({
  labelId,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  labelId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      MessageVariable,
      maxLengthExtension(maxLength),
    ],
    content: messageDoc(value),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        "aria-required": "true",
        class: "message-body-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: updated, transaction }) => {
      if (transaction.docChanged) onChange(messageText(updated.state.doc));
    },
  });

  useEffect(() => {
    if (editor && messageText(editor.state.doc) !== value)
      editor.commands.setContent(messageDoc(value), { emitUpdate: false });
  }, [editor, value]);

  function insertCode(code: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "messageVariable", attrs: { code } })
      .run();
  }

  function format(marker: string) {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const size = marker.length;
    if (from === to) {
      editor
        .chain()
        .focus()
        .insertContentAt(from, `${marker}texto${marker}`)
        .setTextSelection({ from: from + size, to: from + size + 5 })
        .run();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(to, marker)
      .insertContentAt(from, marker)
      .setTextSelection({ from: from + size, to: to + size })
      .run();
  }

  return (
    <>
      <div
        className="template-toolbar"
        role="toolbar"
        aria-label="Personalizar mensagem"
      >
        {messageVariables.map((variable) => (
          <button
            key={variable.code}
            type="button"
            className="variable-chip"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertCode(variable.code)}
            title={`Insere ${variable.code}: vira "${variable.example}" na mensagem`}
          >
            <UserRound size={14} aria-hidden="true" />
            Inserir {variable.label.toLowerCase()}
          </button>
        ))}
        <span className="template-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="icon-button format-button"
          aria-label="Negrito"
          title="Negrito (*texto*)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => format("*")}
        >
          <Bold size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button format-button"
          aria-label="Itálico"
          title="Itálico (_texto_)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => format("_")}
        >
          <Italic size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button format-button"
          aria-label="Riscado"
          title="Riscado (~texto~)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => format("~")}
        >
          <Strikethrough size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="message-body-editor">
        {!value && (
          <span className="message-body-placeholder" aria-hidden="true">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </>
  );
}
