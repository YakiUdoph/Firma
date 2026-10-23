#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredDefaults } from "./src/config.mjs";
import { InvalidReportError } from "./experimental/onchain-proof/src/report-commitment.mjs";
import { independentlyVerifyReport } from "./src/independent-verifier.mjs";
import { BoundedRateLimiter } from "./src/limiter.mjs";
import { parseExpectedCommitment, parseImportedReportText } from "./src/report-import.mjs";
import { verify } from "./src/verifier.mjs";
import { InputError, parseRequestBody } from "./src/validation.mjs";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const active = new Set();
let globalActive = 0;
const limiter = new BoundedRateLimiter();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

function clientKey(request) {
  return request.socket.remoteAddress ?? "local";
}

async function readBody(request, maxBytes = 8_192) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new InputError("Request body is too large.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new InputError("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (request.method === "POST" && ["/api/verify", "/api/check-report"].includes(request.url)) {
    const key = clientKey(request);
    const rate = limiter.consume(key);
    if (!rate.allowed) {
      response.setHeader("retry-after", String(rate.retryAfterSeconds));
      return sendJson(response, 429, { error: "Too many verification requests. Please wait and try again." });
    }
    if (active.has(key)) return sendJson(response, 429, { error: "A verification is already running for this client." });
    if (globalActive >= 4) return sendJson(response, 503, { error: "The verifier is busy. Please try again shortly." });
    active.add(key);
    globalActive += 1;
    try {
      const defaults = configuredDefaults();
      if (request.url === "/api/check-report") {
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) throw new InputError("Content-Type must be application/json.");
        const body = parseRequestBody(await readBody(request, 1_048_576));
        if (typeof body.reportText !== "string") throw new InvalidReportError("Request must include the uploaded report as JSON text.");
        const report = parseImportedReportText(body.reportText);
        const checked = await independentlyVerifyReport({
          report,
          expectedCommitment: parseExpectedCommitment(body.expectedCommitment),
          network: defaults,
        });
        return sendJson(response, 200, checked);
      }
      const body = parseRequestBody(await readBody(request));
      const report = await verify({ ...defaults, assetId: body.assetId ?? defaults.assetId, account: body.account ?? defaults.account });
      return sendJson(response, 200, report);
    } catch (error) {
      const expected = error instanceof InputError || error instanceof InvalidReportError || error instanceof SyntaxError;
      if (!expected) console.error("Verification request failed", { name: error?.name, message: error?.message });
      return sendJson(response, expected ? 400 : 500, { error: expected ? error.message : "Verification failed unexpectedly." });
    } finally {
      active.delete(key);
      globalActive -= 1;
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

server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

