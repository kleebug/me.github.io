import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "docs");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

if (!existsSync(root)) {
  console.error("docs/ 不存在，请先运行 npm run publish");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    let file = path.join(root, pathname);

    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (existsSync(file) && statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }

    if (!existsSync(file)) {
      file = path.join(root, "index.html");
    }

    const ext = path.extname(file);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
}).listen(port, host, () => {
  console.log(`Preview: http://${host}:${port}`);
});
