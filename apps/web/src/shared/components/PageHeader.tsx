import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/** Volta à página anterior do app; aberta direto (link/favorito), vai para `to`. */
export type PageHeaderBack = { to: string; label: string };

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  back?: PageHeaderBack;
}) {
  return (
    <div className="page-header">
      <div className="page-header-title">
        {back && <PageBackButton {...back} />}
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function PageBackButton({ to, label }: PageHeaderBack) {
  const navigate = useNavigate();
  function goBack() {
    const state = window.history.state as { idx?: number } | null;
    if ((state?.idx ?? 0) > 0) void navigate(-1);
    else void navigate(to);
  }
  return (
    <button
      type="button"
      className="page-back-button"
      aria-label={label}
      title={label}
      onClick={goBack}
    >
      <ArrowLeft size={20} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
