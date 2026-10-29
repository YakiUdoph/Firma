import { randomUUID } from "node:crypto";
import { configuredDefaults } from "../src/config.mjs";
import { createVerificationDiagnostics } from "../src/diagnostics.mjs";
import { readRequestText, RequestTooLargeError } from "../src/http-body.mjs";
import { BoundedRateLimiter } from "../src/limiter.mjs";
import { verify } from "../src/verifier.mjs";
import { InputError, parseRequestBody } from "../src/validation.mjs";

const MAX_ACTIVE_PER_INSTANCE = 4;
const MAX_BODY_BYTES = 8_192;

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

export function createVerifyHandler({
  verifyFn = verify,
  defaultsFn = configuredDefaults,
  diagnosticsFn = createVerificationDiagnostics,
} = {}) {
  const limiter = new BoundedRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10_000 });
  let active = 0;
  return {
    async fetch(request) {
      const requestId = randomUUID();
      let diagnostics = null;
      if (request.method !== "POST") return json(405, { error: "Method not allowed.", requestId }, { allow: "POST" });

      const rate = limiter.consume(clientKey(request));
      if (!rate.allowed) {
        return json(429, { error: "Too many verification requests. Please wait and try again.", requestId }, { "retry-after": String(rate.retryAfterSeconds) });
      }
      if (active >= MAX_ACTIVE_PER_INSTANCE) return json(503, { error: "The verifier is busy. Please try again shortly.", requestId });

      active += 1;
      try {
        const text = await readRequestText(request, MAX_BODY_BYTES);
        const body = parseRequestBody(JSON.parse(text || "{}"));
        const defaults = defaultsFn();
        diagnostics = diagnosticsFn({ requestId });
        const report = await verifyFn({
          ...defaults,
          assetId: body.assetId ?? defaults.assetId,
          account: body.account ?? defaults.account,
        }, { diagnostics });
        diagnostics.emit(report.verdict);
        return json(200, { ...report, requestId });
      } catch (error) {
        diagnostics?.emit(null, error);
        if (error instanceof RequestTooLargeError) return json(413, { error: "Request body exceeds 8 KiB.", requestId });
        const expected = error instanceof InputError || error instanceof SyntaxError;
        if (!expected) console.error("FIRMA verification failed", { requestId, category: "unexpected_error" });
        return json(expected ? 400 : 500, { error: expected ? error.message : "Verification failed unexpectedly.", requestId });
      } finally {
        active -= 1;
      }
    },
  };
}

export default createVerifyHandler();
