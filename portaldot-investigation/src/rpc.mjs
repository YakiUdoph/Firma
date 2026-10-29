import { setTimeout as delay } from "node:timers/promises";
import { compactError } from "./codec.mjs";

export const MAX_RPC_RESPONSE_BYTES = 524_288;

export class ResponseTooLargeError extends Error {
  constructor(limit) {
    super(`JSON-RPC response exceeded the ${limit}-byte limit.`);
    this.name = "ResponseTooLargeError";
  }
}

async function readBoundedJson(response, limit) {
  const declared = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel?.("JSON-RPC response exceeded the configured limit.").catch(() => {});
    throw new ResponseTooLargeError(limit);
  }

  if (!response.body?.getReader) {
    const value = await response.json();
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > limit) throw new ResponseTooLargeError(limit);
    return value;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel("JSON-RPC response exceeded the configured limit.").catch(() => {});
        throw new ResponseTooLargeError(limit);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } catch {
    throw new SyntaxError("JSON-RPC response is not valid UTF-8.");
  }
  return JSON.parse(text);
}

function validateJsonRpcEnvelope(body, request) {
  const object = body && typeof body === "object" && !Array.isArray(body);
  const hasResult = object && Object.hasOwn(body, "result");
  const hasError = object && Object.hasOwn(body, "error");
  if (!object || body.jsonrpc !== "2.0" || body.id !== request.id || hasResult === hasError) {
    throw new SyntaxError("Malformed JSON-RPC response envelope.");
  }
}

export class RpcError extends Error {
  constructor(method, detail) {
    super(`${method}: ${detail?.message ?? "JSON-RPC error"}`);
    this.name = "RpcError";
    this.code = detail?.code;
    this.detail = detail;
  }
}

export function timeoutError(label, timeoutMs) {
  return Object.assign(new Error(`${label} timed out after ${timeoutMs} ms.`), { name: "TimeoutError" });
}

export function boundedTimeoutMs(timeoutMs, deadlineAt = null, label = "Operation") {
  const configured = Number(timeoutMs);
  const remaining = deadlineAt === null ? configured : Math.floor(deadlineAt - Date.now());
  if (!Number.isFinite(configured) || configured <= 0 || remaining <= 0) throw timeoutError(label, 0);
  return Math.max(1, Math.min(configured, remaining));
}

export async function withTimeout(promise, timeoutMs, label, { signal = null } = {}) {
  if (signal?.aborted) throw signal.reason ?? Object.assign(new Error(`${label} was cancelled.`), { name: "AbortError" });
  let timer;
  let onAbort;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
  });
  const aborted = signal ? new Promise((_, reject) => {
    onAbort = () => reject(signal.reason ?? Object.assign(new Error(`${label} was cancelled.`), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
  }) : null;
  try {
    return await Promise.race(aborted ? [promise, timeout, aborted] : [promise, timeout]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export class EvmRpcClient {
  constructor(endpoint, { timeoutMs, retries, fetchFn = fetch, delayFn = delay, signal = null, deadlineAt = null, maxResponseBytes = MAX_RPC_RESPONSE_BYTES }) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.fetchFn = fetchFn;
    this.delayFn = delayFn;
    this.signal = signal;
    this.deadlineAt = deadlineAt;
    this.maxResponseBytes = maxResponseBytes;
    this.nextId = 1;
    this.history = [];
  }

  async call(method, params = []) {
    const request = { jsonrpc: "2.0", id: this.nextId++, method, params };
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (this.signal?.aborted) throw this.signal.reason ?? Object.assign(new Error("EVM request was cancelled."), { name: "AbortError" });
      const startedAt = new Date().toISOString();
      let recorded = false;
      try {
        const timeoutMs = boundedTimeoutMs(this.timeoutMs, this.deadlineAt, method);
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = this.signal ? AbortSignal.any([this.signal, timeoutSignal]) : timeoutSignal;
        const response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "firma-readonly/0.1" },
          body: JSON.stringify(request),
          signal,
        });
        const body = await readBoundedJson(response, this.maxResponseBytes);
        this.history.push({ startedAt, attempt, request, httpStatus: response.status, response: body });
        recorded = true;
        if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
        validateJsonRpcEnvelope(body, request);
        if (body.error) throw new RpcError(method, body.error);
        return body.result;
      } catch (error) {
        lastError = error;
        if (!recorded) {
          this.history.push({ startedAt, attempt, request, error: compactError(error) });
        }
        if (error instanceof RpcError || error instanceof ResponseTooLargeError || attempt === this.retries) break;
        await this.delayFn(250 * (attempt + 1), undefined, this.signal ? { signal: this.signal } : undefined);
      }
    }
    throw lastError;
  }
}

