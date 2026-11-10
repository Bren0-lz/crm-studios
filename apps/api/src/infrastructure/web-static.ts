import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function fileAt(path: string) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Serve o site compilado (`apps/web/dist`): arquivo existente sai como está;
 * rota sem extensão (`/clientes/123`) recebe o `index.html` da SPA; o resto é 404. Os arquivos
 * de `/assets/` têm hash no nome e ficam em cache por um ano; o `index.html` nunca fica.
 */
export function createWebHandler(rootDir: string) {
  const root = resolve(rootDir);
  const indexPath = join(root, "index.html");

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://site").pathname,
      );
    } catch {
      res.writeHead(400).end();
      return;
    }
    const requested = resolve(root, `.${pathname}`);
    // Nunca sai da pasta do site (`/../.env`, `%2e%2e`…).
    const inside = requested === root || requested.startsWith(root + sep);
    let path = inside ? requested : undefined;
    let info = path ? await fileAt(path) : undefined;
    if (!info && !extname(pathname)) {
      path = indexPath;
      info = await fileAt(indexPath);
    }
    if (!path || !info) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Não encontrado");
      return;
    }
    res.writeHead(200, {
      "content-type":
        contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(path).pipe(res);
  };
}
