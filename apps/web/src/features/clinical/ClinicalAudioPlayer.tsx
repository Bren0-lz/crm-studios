import { useEffect, useState } from "react";
import { api } from "../../api";
export function ClinicalAudioPlayer({
  attachmentId,
}: {
  attachmentId: string;
}) {
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );
  async function load() {
    setError("");
    try {
      const file = await api.clinicalAttachmentContent(attachmentId);
      const bytes = Uint8Array.from(atob(file.contentBase64), (char) =>
        char.charCodeAt(0),
      );
      setSrc(URL.createObjectURL(new Blob([bytes], { type: file.mimeType })));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <div>
      {error && <p className="form-error">{error}</p>}
      {src ? (
        <audio controls src={src} />
      ) : (
        <button className="secondary-button" onClick={() => void load()}>
          Reproduzir áudio
        </button>
      )}
    </div>
  );
}
