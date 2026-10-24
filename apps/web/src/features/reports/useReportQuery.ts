import { useEffect, useState } from "react";

export type ReportPeriod = { from: string; to: string; version: number };

/** Resultados antigos nunca são exibidos sob um período novo. */
export function useReportQuery<T>(
  period: ReportPeriod,
  loader: (from: string, to: string) => Promise<T>,
  enabled = true,
) {
  const { from, to, version } = period;
  const key = `${from}/${to}/${version}/${enabled}`;
  const [result, setResult] = useState<{
    key: string;
    loader?: typeof loader;
    data: T | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loader(from, to).then(
      (data) => active && setResult({ key, loader, data, error: "" }),
      (cause: Error) =>
        active && setResult({ key, loader, data: null, error: cause.message }),
    );
    return () => {
      active = false;
    };
  }, [key, from, to, loader, enabled]);
  const current = result.key === key && result.loader === loader;
  return {
    data: current ? result.data : null,
    error: current ? result.error : "",
    loading: enabled && (!current || (!result.data && !result.error)),
  };
}
