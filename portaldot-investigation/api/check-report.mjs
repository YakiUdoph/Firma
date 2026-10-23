import { randomUUID } from "node:crypto";
import { InvalidReportError } from "../experimental/onchain-proof/src/report-commitment.mjs";
import { configuredDefaults } from "../src/config.mjs";
import { independentlyVerifyReport } from "../src/independent-verifier.mjs";
import { BoundedRateLimiter } from "../src/limiter.mjs";
import { parseExpectedCommitment, parseImportedReportText } from "../src/report-import.mjs";
import { withTimeout } from "../src/rpc.mjs";
import { InputError, parseRequestBody } from "../src/validation.mjs";

const MAX_BODY_BYTES = 1_048_576;
const VERIFICATION_TIMEOUT_MS = 55_000;

class RequestTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestTooLargeError";
  }
}

async function readRequestText(request, maxBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("Request body exceeded the configured limit.").catch(() => {});
        throw new RequestTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

function json(status, body, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 128);
}

export function createCheckReportHandler({
  verifyFn = independentlyVerifyReport,
  defaultsFn = configuredDefaults,
  verificationTimeoutMs = VERIFICATION_TIMEOUT_MS,
} = {}) {
  const limiter = new BoundedRateLimiter({ limit: 3, windowMs: 60_000, maxKeys: 10_000 });
  let active = 0;
  return {
    async fetch(request) {
      const requestId = randomUUID();
      if (request.method !== "POST") return json(405, { error: "Method not allowed.", requestId }, { allow: "POST" });
      if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
        return json(415, { error: "Content-Type must be application/json.", requestId });
      }
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json(413, { error: "Request body is too large.", requestId });
      const rate = limiter.consume(clientKey(request));
      if (!rate.allowed) return json(429, { error: "Too many report checks. Please wait and try again.", requestId }, { "retry-after": String(rate.retryAfterSeconds) });
      if (active >= 3) return json(503, { error: "The report checker is busy. Please try again shortly.", requestId });

      active += 1;
      try {
        const text = await readRequestText(request, MAX_BODY_BYTES);
        const body = parseRequestBody(JSON.parse(text || "{}"));
        if (typeof body.reportText !== "string") throw new InvalidReportError("Request must include the uploaded report as JSON text.");
        const report = parseImportedReportText(body.reportText);
        const expectedCommitment = parseExpectedCommitment(body.expectedCommitment);
        const result = await withTimeout(
          verifyFn({ report, expectedCommitment, network: defaultsFn() }),
          verificationTimeoutMs,
          "Independent verification",
        );
        return json(200, { ...result, requestId });
      } catch (error) {
        if (error instanceof RequestTooLargeError) return json(413, { error: error.message, requestId });
        if (error?.name === "TimeoutError") return json(504, { error: "Independent verification timed out.", requestId });
        const expected = error instanceof InvalidReportError || error instanceof InputError || error instanceof SyntaxError;
        if (!expected) console.error("FIRMA independent verification failed", { requestId, name: error?.name, message: error?.message });
        return json(expected ? 400 : 500, { error: expected ? error.message : "Independent verification failed unexpectedly.", requestId });
      } finally {
        active -= 1;
      }
    },
  };
}

export default createCheckReportHandler();
