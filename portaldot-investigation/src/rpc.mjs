import { setTimeout as delay } from "node:timers/promises";
import { compactError } from "./codec.mjs";

export class RpcError extends Error {
  constructor(method, detail) {
    super(`${method}: ${detail?.message ?? "JSON-RPC error"}`);
    this.name = "RpcError";
    this.code = detail?.code;
    this.detail = detail;
  }
}

export async function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${timeoutMs} ms.`), { name: "TimeoutError" })), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class EvmRpcClient {
  constructor(endpoint, { timeoutMs, retries }) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.nextId = 1;
    this.history = [];
  }

  async call(method, params = []) {
    const request = { jsonrpc: "2.0", id: this.nextId++, method, params };
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const startedAt = new Date().toISOString();
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "firma-readonly/0.1" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const body = await response.json();
        this.history.push({ startedAt, attempt, request, httpStatus: response.status, response: body });
        if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
        if (body.error) throw new RpcError(method, body.error);
        return body.result;
      } catch (error) {
        lastError = error;
        if (!this.history.some((item) => item.startedAt === startedAt)) {
          this.history.push({ startedAt, attempt, request, error: compactError(error) });
        }
        if (error instanceof RpcError || attempt === this.retries) break;
        await delay(250 * (attempt + 1));
      }
    }
    throw lastError;
  }
}

