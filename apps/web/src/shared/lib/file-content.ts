export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}
export function downloadBase64File(file: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}) {
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) =>
      char.charCodeAt(0),
    ),
    url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType })),
    link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
