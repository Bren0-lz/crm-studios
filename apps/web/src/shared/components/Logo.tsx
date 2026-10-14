import { useEffect, useState } from "react";
import { hasSession, api } from "../../api";
export function Logo() {
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
    <div className="brand" aria-label={branding?.name ?? "Studios Aryana"}>
      {branding?.logoDataUrl ? (
        <img
          className="clinic-logo"
          src={branding.logoDataUrl}
          alt={branding.name}
        />
      ) : (
        <span className="brand-name">Studios Aryana</span>
      )}
    </div>
  );
}
