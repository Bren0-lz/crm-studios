export interface ManualChapter {
  id: string;
  titulo: string;
  fontes?: string[];
}
export interface ManualData<Chapter extends ManualChapter = ManualChapter> {
  material: string;
  manualPath: string;
  manualSha256: string;
  sourceHashes: Record<string, string>;
  capitulos: Chapter[];
}
export interface ManualCheck<Data extends ManualData> {
  changed: string[];
  stale: { id: string; titulo: string }[];
  fresh: Data;
}
export function sha(text: string): string;
export function checkManual<Data extends ManualData>(
  data: Data,
  readSource: (path: string) => string | undefined,
): ManualCheck<Data>;
export function staleWarning(
  check: Pick<ManualCheck<ManualData>, "changed" | "stale">,
): string;
