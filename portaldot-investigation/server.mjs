#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { configuredDefaults } from "./src/config.mjs";
import { InvalidReportError } from "./experimental/onchain-proof/src/report-commitment.mjs";
import { independentlyVerifyReport } from "./src/independent-verifier.mjs";
import { BoundedRateLimiter } from "./src/limiter.mjs";
import {
  AnchorInputError,
  normalizeTransactionHash,
  prepareAnchorTransaction,
  verifyOnchainAnchor,
} from "./src/onchain-anchor.mjs";
import { NativeAnchorInputError, prepareNativeAnchor, verifyNativeAnchor } from "./src/native-anchor.mjs";
import { parseExpectedCommitment, parseImportedReportText } from "./src/report-import.mjs";
import { withTimeout } from "./src/rpc.mjs";
import { verify } from "./src/verifier.mjs";
import { InputError, parseRequestBody } from "./src/validation.mjs";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const active = new Set();
let globalActive = 0;
const limiter = new BoundedRateLimiter();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const nativeWalletBundle = await build({
  entryPoints: [fileURLToPath(new URL("./browser/native-wallet.mjs", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  write: false,
  legalComments: "none",
});
const nativeWalletSource = nativeWalletBundle.outputFiles[0].contents;

class RequestTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestTooLargeError";
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}

function clientKey(request) {
  return request.socket.remoteAddress ?? "local";
}

async function readBody(request, maxBytes = 8_192) {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLargeError();
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestTooLargeError();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self' wss://test-node-v3.portaldot.dev; img-src 'self' data:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; frame-ancestors 'none'");
  if (request.method === "POST" && ["/api/verify", "/api/check-report", "/api/onchain-proof"].includes(request.url)) {
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
      if (request.url === "/api/onchain-proof") {
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) throw new InputError("Content-Type must be application/json.");
        const body = parseRequestBody(await readBody(request, 1_048_576));
        if (typeof body.reportText !== "string") throw new InvalidReportError("Request must include the original FIRMA report as JSON text.");
        const report = parseImportedReportText(body.reportText);
        if (body.action === "prepare") return sendJson(response, 200, prepareAnchorTransaction(report, body.account));
        if (body.action === "prepare-native") return sendJson(response, 200, prepareNativeAnchor(report, body.account));
        if (body.action === "verify") {
          let transactionHash = body.transactionHash;
          let claimedEvidence = null;
          if (!transactionHash && typeof body.anchorEvidenceText === "string") {
            claimedEvidence = JSON.parse(body.anchorEvidenceText);
            if (!claimedEvidence || typeof claimedEvidence !== "object" || Array.isArray(claimedEvidence)) throw new AnchorInputError("Anchoring evidence must be a JSON object.");
            if (!["firma.anchor.v1", "firma.anchor.native.v1"].includes(claimedEvidence.schema)) throw new AnchorInputError("Anchoring evidence uses an unsupported schema.");
            transactionHash = claimedEvidence.transactionHash;
          }
          const checked = claimedEvidence?.schema === "firma.anchor.native.v1"
            ? await withTimeout(verifyNativeAnchor({ report, claimedEvidence, network: defaults }), 55_000, "Native proof verification")
            : await withTimeout(verifyOnchainAnchor({
              report,
              transactionHash: normalizeTransactionHash(transactionHash),
              claimedEvidence,
              network: defaults,
            }), 55_000, "On-chain proof verification");
          return sendJson(response, 200, checked);
        }
        throw new AnchorInputError("Action must be prepare or verify.");
      }
      if (request.url === "/api/check-report") {
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) throw new InputError("Content-Type must be application/json.");
        const body = parseRequestBody(await readBody(request, 1_048_576));
        if (typeof body.reportText !== "string") throw new InvalidReportError("Request must include the uploaded report as JSON text.");
        const report = parseImportedReportText(body.reportText);
        const checked = await withTimeout(
          independentlyVerifyReport({
            report,
            expectedCommitment: parseExpectedCommitment(body.expectedCommitment),
            network: defaults,
          }),
          55_000,
          "Independent verification",
        );
        return sendJson(response, 200, checked);
      }
      const body = parseRequestBody(await readBody(request));
      const report = await verify({ ...defaults, assetId: body.assetId ?? defaults.assetId, account: body.account ?? defaults.account });
      return sendJson(response, 200, report);
    } catch (error) {
      if (error instanceof RequestTooLargeError) return sendJson(response, 413, { error: error.message });
      if (error?.name === "TimeoutError") return sendJson(response, 504, { error: "Independent verification timed out." });
      const expected = error instanceof InputError || error instanceof InvalidReportError || error instanceof AnchorInputError || error instanceof NativeAnchorInputError || error instanceof SyntaxError;
      if (!expected) console.error("Verification request failed", { category: "unexpected_error" });
      return sendJson(response, expected ? 400 : 500, { error: expected ? error.message : "Verification failed unexpectedly." });
    } finally {
      active.delete(key);
      globalActive -= 1;
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "Method not allowed." });
  if (request.url === "/native-wallet.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : nativeWalletSource);
    return;
  }
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
  console.log("Read-only verifier with optional browser-wallet testnet anchoring; endpoints are fixed by server configuration.");
});

server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;

