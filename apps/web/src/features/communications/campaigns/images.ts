import type { MessageTemplateImageContent } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../../api";

// As imagens não mudam depois de gravadas (trocar cria outra), então o cache vale a sessão toda.
const cache = new Map<string, Promise<MessageTemplateImageContent>>();

export function loadTemplateImage(imageId: string) {
  let pending = cache.get(imageId);
  if (!pending) {
    pending = api.messageTemplateImage(imageId);
    pending.catch(() => cache.delete(imageId));
    cache.set(imageId, pending);
  }
  return pending;
}

/** Data URL das imagens pedidas (as que ainda carregam ficam de fora do mapa). */
export function useTemplateImages(imageIds: readonly string[]) {
  const key = imageIds.join(",");
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const ids = key ? key.split(",") : [];
    for (const id of ids)
      loadTemplateImage(id)
        .then(
          (image) =>
            active &&
            setLoaded((current) =>
              current[id] ? current : { ...current, [id]: image.dataUrl },
            ),
        )
        .catch(
          () => active && setError("Não foi possível carregar as imagens."),
        );
    return () => {
      active = false;
    };
  }, [key]);
  return { images: loaded, error };
}
