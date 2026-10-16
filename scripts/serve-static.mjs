import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "out");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || "3000");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

export function createPreviewServer(directory = rootDir) {
  const root = fs.realpathSync(directory);
  function resolvePath(urlPath) {
    const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
    if (cleanPath.includes("\\") || cleanPath.includes("\0")) return null;
    let filePath = path.resolve(root, "." + (cleanPath.startsWith("/") ? cleanPath : "/" + cleanPath));
    if (!isWithin(root, filePath)) return null;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
    if (!fs.existsSync(filePath)) filePath = path.join(root, "index.html");
    const realPath = fs.realpathSync(filePath);
    return isWithin(root, realPath) && fs.statSync(realPath).isFile() ? realPath : null;
  }

  return http.createServer((request, response) => {
    let filePath;
    try {
      filePath = resolvePath(request.url || "/");
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404);
      response.end(error instanceof URIError ? "Bad request" : "Not found");
      return;
    }
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    });
    stream.on("open", () => {
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      stream.pipe(response);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const server = createPreviewServer();
  server.listen(port, host, () => {
    console.log(`[serve-static] Serving ${rootDir} on http://${host}:${server.address().port}`);
  });
}
