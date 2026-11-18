import { useEffect, useState } from "react";
import { hasSession, api } from "../../api";
import { initials } from "../lib/formatting";

export function Logo({ compactMark = false }: { compactMark?: boolean }) {
  const [branding, setBranding] = useState<{
    name: string;
    logoDataUrl: string;
  } | null>(null);
  useEffect(() => {
    if (!hasSession()) return;
    let alive = true;
    const load = () => {
      api
        .clinicBranding()
        .then((data) => {
          if (alive) setBranding(data);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("crm:branding-updated", load);
    return () => {
      alive = false;
      window.removeEventListener("crm:branding-updated", load);
    };
  }, []);
  return (
    <div className="brand" aria-label={branding?.name ?? "Organiza Studios"}>
      {branding?.logoDataUrl ? (
        <img
          className="clinic-logo"
          src={branding.logoDataUrl}
          alt={branding.name}
        />
      ) : (
        <>
          <span className="brand-name">Organiza Studios</span>
          {compactMark && (
            <span className="brand-monogram" aria-hidden="true">
              {initials(branding?.name ?? "Organiza Studios")}
            </span>
          )}
        </>
      )}
    </div>
  );
}
