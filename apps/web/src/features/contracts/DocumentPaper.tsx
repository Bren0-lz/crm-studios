import {
  documentTemplateVariables,
  type ClinicBranding,
  type DocumentContent,
  type DocumentNode,
} from "@crm/contracts";
import { Fragment, type ReactNode } from "react";
import { Logo } from "../../shared/components/Logo";
import { companyIdentification } from "./model";

/** Cabeçalho do documento impresso: logo da clínica e identificação da empresa. */
export function DocumentLetterhead({
  branding,
}: {
  branding?: ClinicBranding | null | undefined;
}) {
  const lines = companyIdentification(branding);
  return (
    <header className="document-letterhead">
      {branding ? (
        <div className="brand" aria-label={branding.name}>
          {branding.logoDataUrl ? (
            <img
              className="clinic-logo"
              src={branding.logoDataUrl}
              alt={branding.name}
            />
          ) : (
            <span className="brand-name">{branding.name}</span>
          )}
        </div>
      ) : (
        <Logo />
      )}
      {lines.length > 0 && (
        <div className="document-letterhead-company">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </header>
  );
}

/** Folha A4 com o documento como ele sai na impressão. */
export function DocumentPaper({
  body,
  branding,
  content,
}: {
  body: string;
  content?: DocumentContent | undefined;
  branding?: ClinicBranding | null | undefined;
}) {
  return (
    <article className="document-paper">
      <DocumentLetterhead branding={branding} />
      {content ? (
        <DocumentContentView content={content} />
      ) : (
        <p className="document-paper-body">
          {body || "O texto do modelo aparece aqui."}
        </p>
      )}
    </article>
  );
}

export function DocumentContentView({ content }: { content: DocumentContent }) {
  function render(node: DocumentNode, key: number): ReactNode {
    const children = node.content?.map(render);
    const className = `document-align-${node.attrs?.textAlign ?? "left"}`;
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const mark of node.marks ?? [])
        text =
          mark.type === "bold" ? (
            <strong>{text}</strong>
          ) : mark.type === "italic" ? (
            <em>{text}</em>
          ) : (
            <u>{text}</u>
          );
      return <Fragment key={key}>{text}</Fragment>;
    }
    if (node.type === "hardBreak") return <br key={key} />;
    if (node.type === "documentField")
      return (
        <span key={key} className="document-field">
          {
            documentTemplateVariables.find(
              (item) => item.key === node.attrs?.key,
            )?.label
          }
        </span>
      );
    if (node.type === "heading")
      return node.attrs?.level === 1 ? (
        <h1 className={className} key={key}>
          {children}
        </h1>
      ) : (
        <h2 className={className} key={key}>
          {children}
        </h2>
      );
    if (node.type === "paragraph")
      return (
        <p className={className} key={key}>
          {children?.length ? children : <br />}
        </p>
      );
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList")
      return (
        <ol key={key} start={node.attrs?.start ?? 1}>
          {children}
        </ol>
      );
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    return <Fragment key={key}>{children}</Fragment>;
  }
  return (
    <div className="document-rich-content document-rendered-content">
      {render(content.doc, 0)}
    </div>
  );
}
