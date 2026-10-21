/** O WhatsApp Web e a área de transferência só aceitam colar PNG: JPEG/WebP são convertidos. */
async function pngBlob(dataUrl: string): Promise<Blob> {
  if (dataUrl.startsWith("data:image/png"))
    return (await fetch(dataUrl)).blob();
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Não foi possível preparar a imagem.")),
      "image/png",
    ),
  );
}

export function canCopyImages() {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

export async function copyImageToClipboard(dataUrl: string) {
  if (!canCopyImages())
    throw new Error(
      "Este navegador não copia imagens. Use “Baixar” e anexe pelo WhatsApp.",
    );
  // A promessa vai direto no ClipboardItem para o Safari manter o gesto do clique.
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": pngBlob(dataUrl) }),
  ]);
}

export async function copyText(text: string) {
  if (!navigator.clipboard?.writeText)
    throw new Error("A cópia não está disponível neste navegador.");
  await navigator.clipboard.writeText(text);
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const [header, base64 = ""] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], fileName, { type });
}

/** Celular: o compartilhamento nativo leva imagens + texto direto para o WhatsApp. */
export function shareFiles(
  images: Array<{ dataUrl: string; fileName: string }>,
) {
  const files = images.map((image) =>
    dataUrlToFile(image.dataUrl, image.fileName),
  );
  return typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
    ? files
    : null;
}
