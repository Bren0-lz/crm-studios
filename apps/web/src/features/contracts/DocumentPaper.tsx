import type { ClinicBranding } from "@crm/contracts";
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
      <Logo />
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
}: {
  body: string;
  branding?: ClinicBranding | null | undefined;
}) {
  return (
    <article className="document-paper">
      <DocumentLetterhead branding={branding} />
      <p className="document-paper-body">
        {body || "O texto do modelo aparece aqui."}
      </p>
    </article>
  );
}
