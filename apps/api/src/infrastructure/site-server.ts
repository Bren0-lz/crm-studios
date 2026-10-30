import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { apiPrefix, stripApiPrefix } from "./serverless-app.js";

/**
 * Servidor único do site publicado num app Node.js (Hostinger): `/api/*` vai para a
 * aplicação Fastify (sem o prefixo, como na função da Vercel) e o resto é o site React
 * compilado. Rotas do site sem arquivo (ex.: `/agenda`) devolvem o `index.html` (SPA).
 */

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

export function isApiRequest(url: string) {
  return (
    url === apiPrefix ||
    url.startsWith(`${apiPrefix}/`) ||
    url.startsWith(`${apiPrefix}?`)
  );
}

/** Caminho do arquivo pedido dentro de `webDir`, ou `undefined` se tentar sair dele. */
export function resolveSitePath(webDir: string, url: string) {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, "http://site").pathname);
  } catch {
    return undefined;
  }
  if (pathname.includes("\0")) return undefined;
  const root = normalize(webDir);
  const file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep))
    return undefined;
  return file;
}

async function fileAt(path: string) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : undefined;
  } catch {
    return undefined;
  }
}

function send(res: ServerResponse, status: number, message: string) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(message);
}

export async function serveSiteFile(
  webDir: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return send(res, 405, "Método não permitido");
  }
  const requested = resolveSitePath(webDir, req.url ?? "/");
  if (!requested) return send(res, 400, "Endereço inválido");

  let path = requested;
  let info = await fileAt(path);
  if (!info) {
    // Arquivo com extensão que não existe (ex.: um /assets/ antigo) é 404 de verdade;
    // o resto é rota do React e recebe o index.html.
    if (extname(path)) return send(res, 404, "Arquivo não encontrado");
    path = join(webDir, "index.html");
    info = await fileAt(path);
    if (!info) return send(res, 404, "Site não compilado");
  }

  res.statusCode = 200;
  res.setHeader(
    "content-type",
    contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
  );
  res.setHeader("content-length", info.size);
  res.setHeader("x-content-type-options", "nosniff");
  // Os arquivos de /assets/ levam hash no nome (Vite); o index.html sempre é revalidado
  // para o navegador pegar a versão nova logo depois de um deploy.
  res.setHeader(
    "cache-control",
    path.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (req.method === "HEAD") return res.end();
  createReadStream(path)
    .on("error", () => res.destroy())
    .pipe(res);
}

export function createSiteServer(app: FastifyInstance, webDir: string) {
  return createServer((req, res) => {
    const url = req.url ?? "/";
    if (isApiRequest(url)) {
      req.url = stripApiPrefix(url);
      app.server.emit("request", req, res);
      return;
    }
    serveSiteFile(webDir, req, res).catch(() => {
      if (!res.headersSent) send(res, 500, "Erro ao ler o site");
      else res.destroy();
    });
  });
}
