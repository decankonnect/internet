const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
  ".webp": "image/webp",
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Upload-Size, Accept");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  res.end(body);
}

async function resolvePublicIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Unexpected public IP API response: ${response.status}`);
    }

    const payload = await response.json();
    return payload.ip || null;
  } catch (error) {
    console.warn("Unable to resolve public IP via ipify:", error.message);
    return null;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
      size += chunk.length;
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks, size));
    });

    req.on("error", reject);
  });
}

async function serveStaticFile(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = safePath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT_DIR, relativePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Unable to read file");
    });
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/ip") {
    const ip = await resolvePublicIp();
    if (!ip) {
      sendJson(res, 500, {
        error: "Unable to determine public IP from the configured backend provider.",
      });
      return;
    }

    sendJson(res, 200, { ip });
    return;
  }

  if (url.pathname === "/api/ping") {
    res.writeHead(204, {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/download") {
    const requestedSize = Number(url.searchParams.get("size") || 8 * 1024 * 1024);
    const size = Math.min(Math.max(requestedSize, 1 * 1024 * 1024), 25 * 1024 * 1024);
    const payload = Buffer.alloc(size, 0x41);

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Content-Disposition": "attachment; filename=decan-download.bin",
    });

    res.end(payload);
    return;
  }

  if (url.pathname === "/api/upload") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Only POST requests are supported for uploads." }));
      return;
    }

    try {
      const body = await readRequestBody(req);
      const receivedBytes = body.byteLength || 0;

      sendJson(res, 200, {
        ok: true,
        receivedBytes,
        message: "Upload received successfully.",
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: "Unable to process upload.",
      });
    }
    return;
  }

  await serveStaticFile(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Decan speed-test backend running on http://localhost:${PORT}`);
  console.log(`Download endpoint: http://localhost:${PORT}/api/download?size=10485760`);
  console.log(`Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`IP endpoint: http://localhost:${PORT}/api/ip`);
  console.log(`Latency endpoint: http://localhost:${PORT}/api/ping`);
});
