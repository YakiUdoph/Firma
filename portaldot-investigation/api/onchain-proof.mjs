import { randomUUID } from "node:crypto";
import { InvalidReportError } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { configuredDefaults } from "../src/config.mjs";
import {
  AnchorInputError,
  normalizeTransactionHash,
  prepareAnchorTransaction,
  verifyOnchainAnchor,
} from "../src/onchain-anchor.mjs";
import {
  NativeAnchorInputError,
  prepareNativeAnchor,
  verifyNativeAnchor,
} from "../src/native-anchor.mjs";
import { BoundedRateLimiter } from "../src/limiter.mjs";
import { MAX_REPORT_BYTES, parseImportedReportText } from "../src/report-import.mjs";
import { withTimeout } from "../src/rpc.mjs";
import { InputError, parseRequestBody } from "../src/validation.mjs";

const MAX_BODY_BYTES = 1_048_576;
const VERIFY_TIMEOUT_MS = 55_000;

class RequestTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestTooLargeError";
  }
}

function json(status, body, requestId, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
      ...extraHeaders,
    },
  });
}

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 128);
}

async function readBody(request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new RequestTooLargeError();
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel("Request body exceeded the configured limit.").catch(() => {});
        throw new RequestTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return parseRequestBody(JSON.parse(Buffer.concat(chunks, size).toString("utf8") || "{}"));
}

function importedReport(body) {
  if (typeof body.reportText !== "string") throw new InvalidReportError("Request must include the original FIRMA report as JSON text.");
  if (Buffer.byteLength(body.reportText, "utf8") > MAX_REPORT_BYTES) throw new InvalidReportError("Uploaded report exceeds 256 KiB.");
  return parseImportedReportText(body.reportText);
}

function transactionReference(body) {
  if (typeof body.transactionHash === "string") return { transactionHash: normalizeTransactionHash(body.transactionHash), claimedEvidence: null };
  if (typeof body.anchorEvidenceText === "string") {
    let evidence;
    try { evidence = JSON.parse(body.anchorEvidenceText); } catch { throw new AnchorInputError("Anchoring evidence is not valid JSON."); }
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new AnchorInputError("Anchoring evidence must be a JSON object.");
    if (!["firma.anchor.v1", "firma.anchor.native.v1"].includes(evidence.schema)) {
      throw new AnchorInputError("Anchoring evidence uses an unsupported schema.");
    }
    return { transactionHash: normalizeTransactionHash(evidence.transactionHash), claimedEvidence: evidence };
  }
  throw new AnchorInputError("Provide a transaction hash or anchoring evidence file.");
}

export function createOnchainProofHandler({
  prepareFn = prepareAnchorTransaction,
  prepareNativeFn = prepareNativeAnchor,
  verifyFn = verifyOnchainAnchor,
  verifyNativeFn = verifyNativeAnchor,
  defaultsFn = configuredDefaults,
  verifyTimeoutMs = VERIFY_TIMEOUT_MS,
  logger = console.error,
} = {}) {
  const limiter = new BoundedRateLimiter({ limit: 6, windowMs: 60_000, maxKeys: 10_000 });
  let active = 0;
  return {
    async fetch(request) {
      const requestId = randomUUID();
      if (request.method !== "POST") return json(405, { error: "Method not allowed.", requestId }, requestId, { allow: "POST" });
      if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
        return json(415, { error: "Content-Type must be application/json.", requestId }, requestId);
      }
      const rate = limiter.consume(clientKey(request));
      if (!rate.allowed) return json(429, { error: "Too many on-chain proof requests. Please wait and try again.", requestId }, requestId, { "retry-after": String(rate.retryAfterSeconds) });
      if (active >= 3) return json(503, { error: "The on-chain proof checker is busy. Please try again shortly.", requestId }, requestId);
      active += 1;
      try {
        const body = await readBody(request);
        const report = importedReport(body);
        if (body.action === "prepare") {
          return json(200, prepareFn(report, body.account), requestId);
        }
        if (body.action === "prepare-native") {
          return json(200, prepareNativeFn(report, body.account), requestId);
        }
        if (body.action === "verify") {
          const reference = transactionReference(body);
          const native = reference.claimedEvidence?.schema === "firma.anchor.native.v1";
          const result = await withTimeout(native
            ? verifyNativeFn({ report, claimedEvidence: reference.claimedEvidence, network: defaultsFn() })
            : verifyFn({ report, ...reference, network: defaultsFn() }), verifyTimeoutMs, native ? "Native proof verification" : "On-chain proof verification");
          return json(200, result, requestId);
        }
        throw new AnchorInputError("Action must be prepare or verify.");
      } catch (error) {
        if (error instanceof RequestTooLargeError) return json(413, { error: error.message, requestId }, requestId);
        if (error?.name === "TimeoutError") return json(504, { error: "On-chain proof verification timed out.", requestId }, requestId);
        const expected = error instanceof InvalidReportError
          || error instanceof AnchorInputError
          || error instanceof NativeAnchorInputError
          || error instanceof InputError
          || error instanceof SyntaxError;
        if (!expected) logger("FIRMA on-chain proof request failed", { requestId, category: "unexpected_error" });
        return json(expected ? 400 : 500, { error: expected ? error.message : "On-chain proof request failed unexpectedly.", requestId }, requestId);
      } finally {
        active -= 1;
      }
    },
  };
}

export default createOnchainProofHandler();
