import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
const root = resolve(import.meta.dirname, "../console/dist");
export async function serveConsole(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path !== "/" && !path.startsWith("/assets/")) return false;
  const asset =
    /^\/assets\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(js|css|svg|woff2))$/.exec(
      path,
    );
  if (path !== "/" && !asset) {
    res.writeHead(404, { "Cache-Control": "no-store" });
    res.end();
    return true;
  }
  try {
    const body = await readFile(
      path === "/"
        ? join(root, "index.html")
        : join(root, "assets", asset![1]!),
    );
    const types: Record<string, string> = {
      js: "text/javascript; charset=utf-8",
      css: "text/css; charset=utf-8",
      svg: "image/svg+xml",
      woff2: "font/woff2",
    };
    res.writeHead(200, {
      "Content-Type":
        path === "/" ? "text/html; charset=utf-8" : types[asset![2]!]!,
      "Cache-Control": path === "/" ? "no-store" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  } catch {
    res.writeHead(path === "/" ? 503 : 404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      path === "/"
        ? "Console build unavailable. Run npm run build."
        : "Asset not found.",
    );
    return true;
  }
}
