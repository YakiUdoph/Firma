#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "./src/constants.mjs";
import { verify } from "./src/verifier.mjs";
import { InputError } from "./src/validation.mjs";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const active = new Set();
const recent = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

function clientKey(request) {
  return request.socket.remoteAddress ?? "local";
}

function allowed(key) {
  const now = Date.now();
  const timestamps = (recent.get(key) ?? []).filter((value) => now - value < 60_000);
  if (timestamps.length >= 5) return false;
  timestamps.push(now);
  recent.set(key, timestamps);
  return true;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_192) throw new InputError("Request body exceeds 8 KiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (request.method === "POST" && request.url === "/api/verify") {
    const key = clientKey(request);
    if (!allowed(key)) return sendJson(response, 429, { error: "Rate limit exceeded. Try again in one minute." });
    if (active.has(key)) return sendJson(response, 429, { error: "A verification is already running for this client." });
    active.add(key);
    try {
      const body = await readBody(request);
      const report = await verify({ ...DEFAULTS, assetId: body.assetId, account: body.account });
      return sendJson(response, 200, report);
    } catch (error) {
      return sendJson(response, error instanceof InputError || error instanceof SyntaxError ? 400 : 500, { error: error.message ?? "Verification failed." });
    } finally {
      active.delete(key);
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "Method not allowed." });
  const pathname = request.url === "/" ? "/index.html" : new URL(request.url, "http://localhost").pathname;
  const safe = normalize(pathname).replace(/^([/\\])+/, "");
  const target = join(root, safe);
  if (!target.startsWith(root)) return sendJson(response, 404, { error: "Not found." });
  try {
    const content = await readFile(target);
    response.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream", "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FIRMA is available at http://127.0.0.1:${port}`);
  console.log("Read-only verifier; endpoints are fixed by server configuration.");
});

