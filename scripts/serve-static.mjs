import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "out");
const host = process.env.HOST || "0.0.0.0";
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

function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = cleanPath === "/" ? "/index.html" : cleanPath;
  let filePath = path.join(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    const fallbackPath = path.join(rootDir, "index.html");
    return fs.existsSync(fallbackPath) ? fallbackPath : null;
  }

  return filePath;
}

const server = http.createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });

  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`[serve-static] Serving ${rootDir} on http://${host}:${port}`);
});
